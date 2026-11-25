import base64
import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from ..core.preprocessing import apply_clahe_and_gamma
from ..core.detector import LunarBoulderDetector
from ..core.physics import estimate_boulder_heights, generate_heightmap_and_slope
from ..core.hazard_grid import compute_hazard_grid_and_safe_zone
from ..core.pathfinder import plan_rover_path_astar
from ..core.copilot import generate_mission_briefing

router = APIRouter(prefix="/api", tags=["MapX"])
detector = LunarBoulderDetector()


def _encode_png_b64(img_bgr: np.ndarray) -> str:
    _, buf = cv2.imencode(".png", img_bgr)
    return "data:image/png;base64," + base64.b64encode(buf).decode("utf-8")


@router.get("/health")
async def health():
    return {"status": "online", "system": "MapX Lunar Boulder Hazard Mapper"}


@router.post("/analyze")
async def analyze_lunar_image(
    file: UploadFile = File(...),
    pixel_scale_m: float = Form(0.5),
    sun_elevation_deg: float = Form(12.0),
    conf_threshold: float = Form(0.45),
    max_boulder_height_m: float = Form(0.5),
    max_slope_deg: float = Form(12.0),
):
    contents = await file.read()
    arr = np.frombuffer(contents, np.uint8)
    raw_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    if raw_bgr is None:
        raise HTTPException(status_code=400, detail="Invalid image file.")

    # Resize very large uploads for fast real-time hackathon demo (<1280px)
    h, w = raw_bgr.shape[:2]
    max_dim = 1024
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        raw_bgr = cv2.resize(raw_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        h, w = raw_bgr.shape[:2]

    # 1. CLAHE + Gamma pre-processing
    enhanced_bgr = apply_clahe_and_gamma(raw_bgr)

    # 2. YOLOv11 + NMS boulder detection
    boulders = detector.detect(
        enhanced_bgr,
        pixel_scale_m=pixel_scale_m,
        conf_threshold=conf_threshold,
    )

    # 3. Shadow-height physics + 3D heightmap & slope
    boulders = estimate_boulder_heights(
        raw_bgr,
        boulders,
        pixel_scale_m=pixel_scale_m,
        sun_elevation_deg=sun_elevation_deg,
    )
    heightmap, slope_deg, shadow_map = generate_heightmap_and_slope(
        raw_bgr, grid_size=96, pixel_scale_m=pixel_scale_m
    )

    # 4. Multi-factor hazard grid + Euclidean Distance Transform safe circle
    hazard_result = compute_hazard_grid_and_safe_zone(
        boulders=boulders,
        slope_deg=slope_deg,
        shadow_map=shadow_map,
        img_shape=(h, w),
        pixel_scale_m=pixel_scale_m,
        max_boulder_height_m=max_boulder_height_m,
        max_slope_deg=max_slope_deg,
    )

    risk_grid = hazard_result["risk_grid"]
    safe_zone = hazard_result["safe_zone"]

    # 5. A* Rover path from safe landing circle to an opposite-quadrant science target
    grid_h, grid_w = risk_grid.shape
    goal_x = int(grid_w * 0.82) if safe_zone["norm_x"] < 0.5 else int(grid_w * 0.18)
    goal_y = int(grid_h * 0.82) if safe_zone["norm_y"] < 0.5 else int(grid_h * 0.18)
    rover_path = plan_rover_path_astar(
        risk_grid,
        start=(safe_zone["grid_x"], safe_zone["grid_y"]),
        goal=(goal_x, goal_y),
    )

    # 6. AI Mission Copilot briefing
    max_boulder_h = round(max([b["height_m"] for b in boulders], default=0.0), 2)
    briefing = generate_mission_briefing(
        boulder_count=len(boulders),
        max_boulder_h=max_boulder_h,
        safe_zone=safe_zone,
        stats=hazard_result["stats"],
    )

    return {
        "image_size": {"width": w, "height": h},
        "enhanced_image_b64": _encode_png_b64(enhanced_bgr),
        "boulders": boulders,
        "boulder_count": len(boulders),
        "max_boulder_height_m": max_boulder_h,
        "safe_zone": safe_zone,
        "stats": hazard_result["stats"],
        "rover_path": rover_path,
        "heightmap": np.round(heightmap, 3).tolist(),
        "risk_grid": np.round(risk_grid, 3).tolist(),
        "mission_briefing": briefing,
    }
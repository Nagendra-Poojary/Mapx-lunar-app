import numpy as np
from scipy.ndimage import distance_transform_edt
from typing import List, Dict, Tuple


def compute_hazard_grid_and_safe_zone(
    boulders: List[Dict],
    slope_deg: np.ndarray,
    shadow_map: np.ndarray,
    img_shape: Tuple[int, int],
    pixel_scale_m: float = 0.5,
    max_boulder_height_m: float = 0.5,
    max_slope_deg: float = 12.0,
) -> Dict:
    """
    Build normalized risk grid (0..1) and find the largest safe touchdown circle.
    Risk weights: 50% Boulder + 35% Slope + 15% Shadow.
    Bands: Safe < 0.30, Caution 0.30–0.65, Unsafe > 0.65.
    """
    grid_h, grid_w = slope_deg.shape
    img_h, img_w = img_shape

    boulder_risk = np.zeros((grid_h, grid_w), dtype=np.float32)

    for b in boulders:
        cx, cy = b["center_px"]
        gx = int(np.clip((cx / max(img_w, 1)) * grid_w, 0, grid_w - 1))
        gy = int(np.clip((cy / max(img_h, 1)) * grid_h, 0, grid_h - 1))

        # Severity based on boulder height relative to lander ground clearance
        severity = min(1.0, b["height_m"] / max(max_boulder_height_m, 0.1))
        radius_cells = max(1, int((b["diameter_m"] / max(pixel_scale_m, 0.05)) * (grid_w / max(img_w, 1)) * 0.7))

        y_min, y_max = max(0, gy - radius_cells - 1), min(grid_h, gy + radius_cells + 2)
        x_min, x_max = max(0, gx - radius_cells - 1), min(grid_w, gx + radius_cells + 2)

        yy, xx = np.ogrid[y_min:y_max, x_min:x_max]
        dist = np.sqrt((yy - gy) ** 2 + (xx - gx) ** 2)
        mask = dist <= (radius_cells + 0.5)
        boulder_risk[y_min:y_max, x_min:x_max][mask] = np.maximum(
            boulder_risk[y_min:y_max, x_min:x_max][mask],
            severity,
        )

    slope_risk = np.clip(slope_deg / max(max_slope_deg, 1.0), 0.0, 1.0)
    risk_grid = np.clip(0.50 * boulder_risk + 0.35 * slope_risk + 0.15 * shadow_map, 0.0, 1.0)

    # 2D Euclidean Distance Transform on Safe cells (< 0.30)
    safe_mask = (risk_grid < 0.30).astype(np.uint8)
    # Keep a small margin away from image borders
    safe_mask[:3, :] = 0
    safe_mask[-3:, :] = 0
    safe_mask[:, :3] = 0
    safe_mask[:, -3:] = 0

    dist_map = distance_transform_edt(safe_mask)
    best_y, best_x = np.unravel_index(np.argmax(dist_map), dist_map.shape)
    best_radius_cells = float(dist_map[best_y, best_x])

    # Fallback if terrain is extremely hazardous: pick lowest-risk cell
    if best_radius_cells < 1.0:
        best_y, best_x = np.unravel_index(np.argmin(risk_grid), risk_grid.shape)
        best_radius_cells = 2.0

    meters_per_cell = (img_w * pixel_scale_m) / grid_w
    safe_radius_m = round(best_radius_cells * meters_per_cell, 2)
    safe_slope_deg = round(float(slope_deg[best_y, best_x]), 2)

    total_cells = grid_h * grid_w
    safe_pct = round(float(np.sum(risk_grid < 0.30)) / total_cells * 100.0, 1)
    caution_pct = round(float(np.sum((risk_grid >= 0.30) & (risk_grid <= 0.65))) / total_cells * 100.0, 1)
    unsafe_pct = round(float(np.sum(risk_grid > 0.65)) / total_cells * 100.0, 1)

    return {
        "risk_grid": risk_grid,
        "safe_zone": {
            "grid_x": int(best_x),
            "grid_y": int(best_y),
            "norm_x": round(float(best_x) / grid_w, 4),
            "norm_y": round(float(best_y) / grid_h, 4),
            "radius_cells": round(best_radius_cells, 2),
            "radius_m": safe_radius_m,
            "slope_deg": safe_slope_deg,
            "clearance_pct": round(min(99.5, max(50.0, (1.0 - float(risk_grid[best_y, best_x])) * 100.0)), 1),
        },
        "stats": {
            "safe_pct": safe_pct,
            "caution_pct": caution_pct,
            "unsafe_pct": unsafe_pct,
            "max_slope_deg": round(float(np.max(slope_deg)), 2),
            "mean_slope_deg": round(float(np.mean(slope_deg)), 2),
        },
    }
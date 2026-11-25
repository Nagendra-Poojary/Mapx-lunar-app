import math
import cv2
import numpy as np
from typing import List, Dict, Tuple


def estimate_boulder_heights(
    raw_bgr: np.ndarray,
    boulders: List[Dict],
    pixel_scale_m: float = 0.5,
    sun_elevation_deg: float = 12.0,
) -> List[Dict]:
    """Estimate 3D rock height via solar-shadow trigonometry: H ≈ L_shadow * tan(theta)."""
    gray = cv2.cvtColor(raw_bgr, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape
    shadow_thresh = float(np.percentile(gray, 22))
    tan_theta = math.tan(math.radians(max(1.0, min(sun_elevation_deg, 80.0))))

    for b in boulders:
        x1, y1, x2, y2 = [int(v) for v in b["bbox_px"]]
        bw = max(4, x2 - x1)
        bh = max(4, y2 - y1)

        # Sample neighborhood around boulder to measure cast shadow run length
        search_r = max(12, int(max(bw, bh) * 2.5))
        rx1, ry1 = max(0, x1 - search_r), max(0, y1 - search_r)
        rx2, ry2 = min(w_img, x2 + search_r), min(h_img, y2 + search_r)
        patch = gray[ry1:ry2, rx1:rx2]

        shadow_mask = (patch < shadow_thresh).astype(np.uint8)
        shadow_pixels = int(np.sum(shadow_mask))

        # Approximate cast shadow length in pixels
        if shadow_pixels > 0:
            shadow_len_px = min(float(search_r), math.sqrt(shadow_pixels) * 1.15)
        else:
            shadow_len_px = max(bw, bh) * 0.6

        shadow_len_m = shadow_len_px * pixel_scale_m
        height_m = round(max(0.15, shadow_len_m * tan_theta), 2)

        b["shadow_length_m"] = round(shadow_len_m, 2)
        b["height_m"] = height_m

    return boulders


def generate_heightmap_and_slope(
    raw_bgr: np.ndarray,
    grid_size: int = 128,
    pixel_scale_m: float = 0.5,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Generate a smooth 3D elevation heightmap (0..1), terrain slope map (degrees),
    and shadow mask (0..1) downsampled to grid_size x grid_size for fast 3D WebGL rendering.
    """
    gray = cv2.cvtColor(raw_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    resized = cv2.resize(gray, (grid_size, grid_size), interpolation=cv2.INTER_AREA)

    # Smooth pseudo-elevation from photometric shading + multi-scale Gaussian relief
    smooth_base = cv2.GaussianBlur(resized, (11, 11), 0)
    fine_detail = cv2.GaussianBlur(resized, (3, 3), 0)
    heightmap = 0.7 * smooth_base + 0.3 * fine_detail
    heightmap = (heightmap - heightmap.min()) / (heightmap.max() - heightmap.min() + 1e-6)

    # Sobel gradients -> terrain slope in degrees
    gx = cv2.Sobel(heightmap, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(heightmap, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = np.sqrt(gx**2 + gy**2)
    slope_deg = np.degrees(np.arctan(grad_mag * 8.0))  # scaled to realistic 0..35 deg lunar slopes

    # Shadow map (1.0 = deep shadow, 0.0 = sunlit)
    shadow_map = np.clip((0.25 - resized) / 0.25, 0.0, 1.0)

    return heightmap, slope_deg, shadow_map
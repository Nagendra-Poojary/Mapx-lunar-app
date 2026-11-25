import cv2
import numpy as np
from typing import List, Tuple, Dict


def apply_clahe_and_gamma(
    image_bgr: np.ndarray,
    clip_limit: float = 2.5,
    tile_grid_size: Tuple[int, int] = (8, 8),
    gamma: float = 1.15,
) -> np.ndarray:
    """Enhance dark lunar shadows while preserving bright crater highlights."""
    if len(image_bgr.shape) == 3:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    else:
        gray = image_bgr.copy()

    # 1. CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    enhanced = clahe.apply(gray)

    # 2. Gamma correction to lift near-black shadow edges
    inv_gamma = 1.0 / max(gamma, 0.1)
    lut = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)], dtype=np.uint8)
    gamma_corrected = cv2.LUT(enhanced, lut)

    return cv2.cvtColor(gamma_corrected, cv2.COLOR_GRAY2BGR)


def generate_overlapping_tiles(
    image_bgr: np.ndarray,
    tile_size: int = 512,
    overlap: float = 0.2,
) -> List[Dict]:
    """Split high-res orbital strip into overlapping tiles so border rocks aren't cut."""
    h, w = image_bgr.shape[:2]
    step = int(tile_size * (1.0 - overlap))
    tiles = []

    if h <= tile_size and w <= tile_size:
        return [{"tile": image_bgr, "x_offset": 0, "y_offset": 0}]

    for y in range(0, h, step):
        for x in range(0, w, step):
            y2 = min(y + tile_size, h)
            x2 = min(x + tile_size, w)
            y1 = max(0, y2 - tile_size)
            x1 = max(0, x2 - tile_size)
            tiles.append({
                "tile": image_bgr[y1:y2, x1:x2],
                "x_offset": x1,
                "y_offset": y1,
            })
            if x2 == w:
                break
        if y2 == h:
            break

    return tiles
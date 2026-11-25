import os
import cv2
import numpy as np
from typing import List, Dict
from .preprocessing import generate_overlapping_tiles

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None


class LunarBoulderDetector:
    def __init__(self, weights_path: str = "models/yolo11_lunar.pt"):
        self.model = None
        if YOLO is not None and os.path.exists(weights_path):
            self.model = YOLO(weights_path)

    def _nms(self, boxes: List[Dict], iou_threshold: float = 0.45) -> List[Dict]:
        """Non-Maximum Suppression to remove duplicate detections across tile borders."""
        if not boxes:
            return []

        boxes = sorted(boxes, key=lambda b: b["confidence"], reverse=True)
        kept = []

        while boxes:
            best = boxes.pop(0)
            kept.append(best)
            remaining = []
            for other in boxes:
                if self._iou(best["bbox_px"], other["bbox_px"]) < iou_threshold:
                    remaining.append(other)
            boxes = remaining

        return kept

    @staticmethod
    def _iou(a: List[float], b: List[float]) -> float:
        x1 = max(a[0], b[0])
        y1 = max(a[1], b[1])
        x2 = min(a[2], b[2])
        y2 = min(a[3], b[3])
        inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
        area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0.0

    def _detect_tile_cv_fallback(self, tile_bgr: np.ndarray, conf_thresh: float) -> List[Dict]:
        """Detects bright lunar boulder faces paired with adjacent dark shadows."""
        gray = cv2.cvtColor(tile_bgr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # High-contrast local maxima (sunlit rock faces)
        mean_val = float(np.mean(blurred))
        std_val = float(np.std(blurred)) + 1e-5
        bright_thresh = min(245, int(mean_val + 1.35 * std_val))
        _, bright_mask = cv2.threshold(blurred, bright_thresh, 255, cv2.THRESH_BINARY)

        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        bright_mask = cv2.morphologyEx(bright_mask, cv2.MORPH_OPEN, kernel)

        contours, _ = cv2.findContours(bright_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detections = []
        h_img, w_img = gray.shape

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 18 or area > (h_img * w_img * 0.08):
                continue

            x, y, w, h = cv2.boundingRect(cnt)
            # Check for dark shadow immediately adjacent to the bright rock face
            pad = max(6, int(max(w, h) * 0.8))
            roi = blurred[max(0, y - pad):min(h_img, y + h + pad), max(0, x - pad):min(w_img, x + w + pad)]
            dark_ratio = float(np.mean(roi < (mean_val - 0.6 * std_val)))
            contrast_score = (float(np.max(roi)) - float(np.min(roi))) / 255.0

            confidence = min(0.98, max(0.35, 0.45 * contrast_score + 0.55 * min(1.0, dark_ratio * 2.2)))
            if confidence >= conf_thresh:
                detections.append({
                    "bbox_px": [float(x), float(y), float(x + w), float(y + h)],
                    "confidence": round(confidence, 3),
                })
        return detections

    def detect(
        self,
        enhanced_bgr: np.ndarray,
        pixel_scale_m: float = 0.5,
        conf_threshold: float = 0.45,
    ) -> List[Dict]:
        """Run tiled detection, merge with NMS, and convert pixels to real meters."""
        tiles = generate_overlapping_tiles(enhanced_bgr, tile_size=512, overlap=0.2)
        raw_detections = []

        for t in tiles:
            tile_img = t["tile"]
            ox, oy = t["x_offset"], t["y_offset"]

            if self.model is not None:
                results = self.model.predict(tile_img, conf=conf_threshold, verbose=False)[0]
                for box in results.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    raw_detections.append({
                        "bbox_px": [x1 + ox, y1 + oy, x2 + ox, y2 + oy],
                        "confidence": round(float(box.conf[0]), 3),
                    })
            else:
                for d in self._detect_tile_cv_fallback(tile_img, conf_threshold):
                    x1, y1, x2, y2 = d["bbox_px"]
                    raw_detections.append({
                        "bbox_px": [x1 + ox, y1 + oy, x2 + ox, y2 + oy],
                        "confidence": d["confidence"],
                    })

        merged = self._nms(raw_detections, iou_threshold=0.45)

        # Enrich with real-world metric dimensions
        final_boulders = []
        for idx, b in enumerate(merged):
            x1, y1, x2, y2 = b["bbox_px"]
            width_px = x2 - x1
            height_px = y2 - y1
            diameter_m = round(max(width_px, height_px) * pixel_scale_m, 2)

            final_boulders.append({
                "id": f"B-{idx + 1:03d}",
                "bbox_px": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                "center_px": [round((x1 + x2) / 2.0, 1), round((y1 + y2) / 2.0, 1)],
                "diameter_m": diameter_m,
                "confidence": b["confidence"],
            })

        return final_boulders
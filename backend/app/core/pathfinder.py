import heapq
import math
import numpy as np
from typing import List, Tuple


def plan_rover_path_astar(
    risk_grid: np.ndarray,
    start: Tuple[int, int],
    goal: Tuple[int, int],
) -> List[List[float]]:
    """
    A* pathfinder on the hazard grid.
    start and goal are (grid_x, grid_y). Returns normalized [[nx, ny], ...] waypoints.
    """
    h, w = risk_grid.shape
    sx, sy = int(np.clip(start[0], 0, w - 1)), int(np.clip(start[1], 0, h - 1))
    gx, gy = int(np.clip(goal[0], 0, w - 1)), int(np.clip(goal[1], 0, h - 1))

    neighbors = [
        (1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0),
        (1, 1, 1.414), (1, -1, 1.414), (-1, 1, 1.414), (-1, -1, 1.414),
    ]

    open_heap = [(0.0, (sx, sy))]
    came_from = {}
    g_score = {(sx, sy): 0.0}

    while open_heap:
        _, current = heapq.heappop(open_heap)
        if current == (gx, gy):
            break

        cx, cy = current
        for dx, dy, step_cost in neighbors:
            nx, ny = cx + dx, cy + dy
            if not (0 <= nx < w and 0 <= ny < h):
                continue

            cell_risk = float(risk_grid[ny, nx])
            # Heavily penalize Unsafe (>0.65) and moderately penalize Caution (0.30-0.65)
            risk_penalty = 25.0 * cell_risk if cell_risk > 0.65 else (4.0 * cell_risk if cell_risk > 0.30 else 0.5 * cell_risk)
            tentative_g = g_score[current] + step_cost + risk_penalty

            if tentative_g < g_score.get((nx, ny), float("inf")):
                came_from[(nx, ny)] = current
                g_score[(nx, ny)] = tentative_g
                h_cost = math.hypot(gx - nx, gy - ny)
                heapq.heappush(open_heap, (tentative_g + h_cost, (nx, ny)))

    # Reconstruct path
    path = []
    node = (gx, gy)
    if node not in came_from and node != (sx, sy):
        return [[round(sx / w, 4), round(sy / h, 4)], [round(gx / w, 4), round(gy / h, 4)]]

    while node in came_from:
        path.append([round(node[0] / w, 4), round(node[1] / h, 4)])
        node = came_from[node]
    path.append([round(sx / w, 4), round(sy / h, 4)])
    path.reverse()

    # Downsample slightly for smooth 3D spline rendering
    if len(path) > 40:
        step = max(1, len(path) // 35)
        path = path[::step] + [path[-1]]

    return path
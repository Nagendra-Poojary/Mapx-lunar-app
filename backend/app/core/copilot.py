import os
from typing import Dict

try:
    from google import genai
except ImportError:
    genai = None


def generate_mission_briefing(
    boulder_count: int,
    max_boulder_h: float,
    safe_zone: Dict,
    stats: Dict,
) -> str:
    """Generate a concise flight-director mission briefing."""
    api_key = os.getenv("GEMINI_API_KEY")

    prompt = (
        f"You are MapX AI Mission Copilot for a lunar south-pole landing.\n"
        f"Telemetry: {boulder_count} boulders detected (max height {max_boulder_h}m), "
        f"Terrain: {stats['safe_pct']}% Safe, {stats['caution_pct']}% Caution, {stats['unsafe_pct']}% Unsafe. "
        f"Optimal Safe Landing Circle: radius {safe_zone['radius_m']}m, slope {safe_zone['slope_deg']}°, "
        f"clearance {safe_zone['clearance_pct']}%.\n"
        f"Write a crisp 2-sentence flight controller recommendation (GO/NO-GO status + key caution)."
    )

    if genai is not None and api_key:
        try:
            client = genai.Client(api_key=api_key)
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            if resp.text:
                return resp.text.strip()
        except Exception:
            pass

    status = "GO FOR TOUCHDOWN" if safe_zone["clearance_pct"] >= 75.0 else "CAUTION — RE-ROUTE ADVISED"
    return (
        f"STATUS: {status}. Optimal landing zone locked at {safe_zone['radius_m']}m safe radius "
        f"({safe_zone['slope_deg']}° slope, {safe_zone['clearance_pct']}% clearance) while avoiding "
        f"{boulder_count} detected boulders (peak height {max_boulder_h}m)."
    )
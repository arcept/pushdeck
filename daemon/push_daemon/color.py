"""Display colour calibration, applied to every frame just before it is sent to the Push.

Calibration (in settings.json under "calibration"):
  red / green / blue : the RGB value the panel should be given to show its truest primary. Chosen by eye with the
                       calibration tests; (255,0,0) / (0,255,0) / (0,0,255) means no correction.
  saturation         : 1.0 = unchanged, >1 boosts colour (applied after the primaries).
"""
from __future__ import annotations

import numpy as np

IDENTITY = {"red": [255, 0, 0], "green": [0, 255, 0], "blue": [0, 0, 255], "saturation": 1.0}
CAL = dict(IDENTITY)
LUMA = np.array([0.299, 0.587, 0.114], dtype=np.float32)


def set_calibration(cal: dict | None):
    CAL.clear()
    CAL.update(IDENTITY)
    if cal:
        CAL.update({k: cal[k] for k in IDENTITY if k in cal})


def is_identity() -> bool:
    return all(CAL[k] == IDENTITY[k] for k in IDENTITY)


def apply(a: np.ndarray, cal: dict | None = None) -> np.ndarray:
    """a: (...,3) uint8/float RGB 0-255 -> uint8 corrected."""
    cal = cal or CAL
    x = a.astype(np.float32)
    prim = np.array([cal["red"], cal["green"], cal["blue"]], dtype=np.float32) / 255.0
    if not np.array_equal(prim, np.eye(3, dtype=np.float32)):
        x = x @ prim
    s = float(cal["saturation"])
    if s != 1.0:
        luma = (x @ LUMA)[..., None]
        x = luma + (x - luma) * s
    return np.clip(x, 0, 255).astype(np.uint8)

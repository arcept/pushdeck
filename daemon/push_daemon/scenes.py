"""Fonts and icon data shared by the display renderer and the tests (the scene system itself lives in display/)."""
import json
from pathlib import Path

from PIL import ImageFont

from .registry import ROOT

W, H = 960, 160
_fonts: dict = {}

FONTS_DIR = ROOT / "design" / "fonts"
# pack -> (regular file, bold file or None when the file is variable, variable axes by name)
PACKS = {
    "plexmono": ("IBMPlexMono-Regular.ttf", "IBMPlexMono-Bold.ttf"),
    "quicksand": ("Quicksand-VF.ttf", None),
    "instrument": ("InstrumentSans-VF.ttf", None),
    "plexsans": ("IBMPlexSans-VF.ttf", None),
}
ACTIVE = {"label": "quicksand", "mono": "plexmono"}  # temporary pair (2026-10-11); final font still undecided


def set_fonts(label=None, mono=None):
    if label:
        ACTIVE["label"] = label
    if mono:
        ACTIVE["mono"] = mono
    _fonts.clear()


def _load(pack, size, bold):
    reg, bold_file = PACKS[pack]
    try:
        if bold_file:
            return ImageFont.truetype(str(FONTS_DIR / (bold_file if bold else reg)), size)
        ft = ImageFont.truetype(str(FONTS_DIR / reg), size)
        vals = []
        for ax in ft.get_variation_axes():
            n = ax["name"].decode().lower()
            vals.append(max(ax["minimum"], min(ax["maximum"], (700 if bold else 500) if n == "weight" else 100)))
        ft.set_variation_by_axes(vals)
        return ft
    except OSError:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)


def font(size, bold=False, role="label"):
    key = (size, bold, role, ACTIVE[role])
    if key not in _fonts:
        _fonts[key] = _load(ACTIVE[role], size, bold)
    return _fonts[key]


def mono(size, bold=False):
    return font(size, bold, "mono")


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


ICONS = json.loads((Path(__file__).parent / "icons.json").read_text())
ICONS.pop("_doc", None)

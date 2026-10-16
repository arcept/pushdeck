"""Canonical control ids (shared with the UI/SVG) mapped to MIDI.

Ids: pad-<row>-<col> (row 0 = TOP row as seen, col 0 = left), knob-tempo, knob-swing, knob-1..8,
knob-master, btn-<slug> (slug from the button's printed name), touch-strip, display.
"""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]           # the program files (read only when packaged as an app)
DATA = Path(os.environ.get("PUSH_HOME") or ROOT)     # what the user changes: settings, profiles, private/ (the app sets PUSH_HOME)


SVG_IDS = {"Up": "arrow-up", "Down": "arrow-down", "Left": "arrow-left", "Right": "arrow-right",
           "Previous Page": "btn-page-left", "Next Page": "btn-page-right"}  # ids used by the replica SVG


def slug(name: str) -> str:
    if name in SVG_IDS:
        return SVG_IDS[name]
    n = name.lower()
    n = re.sub(r"upper display button (\d)", r"upper-\1", n)
    n = re.sub(r"lower display button (\d)", r"lower-\1", n)
    return "btn-" + re.sub(r"[^a-z0-9]+", "-", n).strip("-")


def build():
    reg = json.loads((ROOT / "push2_registry.json").read_text())
    names = json.loads((ROOT / "button_names.json").read_text())["locked"]
    rgb = set(reg["buttons"]["rgb"]["lower_display_row"] + reg["buttons"]["rgb"]["upper_display_row"]
              + reg["buttons"]["rgb"]["scene_launch_column"] + [int(k) for k in reg["buttons"]["rgb"]["named"]])
    controls = {}
    for row in range(8):
        for col in range(8):
            controls[f"pad-{row}-{col}"] = {"kind": "pad", "name": f"Pad {row},{col}",
                                             "note": 36 + (7 - row) * 8 + col, "led": "rgb"}
    for cc, name in names.items():
        cc = int(cc)
        controls[slug(name)] = {"kind": "button", "name": name, "cc": cc, "led": "rgb" if cc in rgb else "white"}
    for e in reg["encoders"]:
        n = e["name"]
        cid = {"Tempo": "knob-tempo", "Swing": "knob-swing", "Master": "knob-master"}.get(n) or "knob-" + n.split()[-1]
        controls[cid] = {"kind": "knob", "name": n, "cc": e["cc"], "touch_note": e["touch_note"]}
    controls["touch-strip"] = {"kind": "strip", "name": "Touch strip", "touch_note": 12}
    return controls


CONTROLS = build()
PAD_BY_NOTE = {c["note"]: i for i, c in CONTROLS.items() if c["kind"] == "pad"}
BTN_BY_CC = {c["cc"]: i for i, c in CONTROLS.items() if c["kind"] == "button"}
KNOB_BY_CC = {c["cc"]: i for i, c in CONTROLS.items() if c["kind"] == "knob"}
KNOB_BY_TOUCH = {c["touch_note"]: i for i, c in CONTROLS.items() if c["kind"] == "knob"}
UPPER = [f"btn-upper-{i}" for i in range(1, 9)]
LOWER = [f"btn-lower-{i}" for i in range(1, 9)]
SCENE = [BTN_BY_CC[cc] for cc in range(43, 35, -1)]  # top to bottom: 1/32T ... 1/4  (CC 43 .. 36)
REPEAT = "btn-repeat"
WINDOW_PADS = [f"pad-{r}-{c}" for r in range(4) for c in range(4)]  # the top-left 4 x 4 pads: the built-in window layouts (windows.py), covering a profile's own pads there while they are on
GLOBAL_PADS = [f"pad-{r}-7" for r in range(8)]  # the right-hand pad column: one shared set for every profile

if __name__ == "__main__":
    print(len(CONTROLS), "controls")
    print(sorted(CONTROLS)[:5], SCENE, UPPER[:2])

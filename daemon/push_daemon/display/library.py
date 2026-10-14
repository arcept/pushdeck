"""Scene library: builds display specs. Scenes are data; renderers draw them identically in Python and the browser.

Layout rule (see design/DISPLAY_SYSTEM.md): 960x160 = 8 columns of 120 px over the 8 encoders and the 16 display
buttons. Top and bottom 40 px hold the label zones; the 80 px body in between holds widgets placed by column.
"""
from .tokens import TOKENS

C = TOKENS["color"]


def _spec(accent, zones, active, widgets, toast=None):
    return {"accent": accent, "zones": zones, "active": sorted(active), "widgets": widgets, "toast": toast}


def message(text, ok=None, sub=""):
    color = "ink" if ok is None else ("good" if ok else "bad")
    return {"accent": "#d97757", "zones": {}, "active": [], "no_zones": True, "toast": None,
            "widgets": [{"type": "title", "col": 0, "span": 8, "text": text, "color": color, "sub": sub, "size": "title"}]}


def standby():
    return {"accent": "#d97757", "zones": {}, "active": [], "no_zones": True, "toast": None,
            "widgets": [{"type": "title", "col": 0, "span": 8, "text": "Turned off from the browser UI", "color": "ink3",
                         "sub": "Use 'Turn Push on' in the UI or the menu bar app", "size": "title"}]}


def test_rainbow():
    return {"accent": "#d97757", "zones": {}, "active": [], "no_zones": True, "toast": None, "widgets": [{"type": "rainbow"}]}


def now_playing_widget(d, snap, position, idle="", pending=None, hint=""):
    """The player widget at the layout entry d (col, w, h: 4 x 2 on a half, or 2 x 2). snap = MediaHub.snapshot()."""
    t = snap.get("track") or {}
    dur = t.get("duration") or 0
    pos = position if pending is None else pending * dur
    w = {"type": "now_playing", "col": d["col"], "row": d.get("row", 0), "w": d["w"], "h": d.get("h", 2), "idle": idle, "title": t.get("title", ""), "artist": t.get("artist", ""),
         "playing": bool(t.get("playing")), "progress": round(pos / dur, 3) if dur else 0, "art": t.get("art") or "", "src_icon": t.get("icon") or "", "brand": t.get("brand") or "", "liked": bool(t.get("liked")), "like_icon": "thumbupfill" if t.get("service") == "ytm" else "heartfill",
         "tint": snap.get("tint") or "#3d8bff", "tint2": snap.get("tint2") or "#1fd1c4", "seeking": pending is not None}
    if dur:
        w["elapsed"], w["total"] = f"{int(pos) // 60}:{int(pos) % 60:02d}", f"{int(dur) // 60}:{int(dur) % 60:02d}"
    if hint:
        w["hint"] = hint
    return w


def media_scene(accent, zones, active, widgets, toast=None):
    return _spec(accent, zones, active, widgets, toast)

"""One-time move of per-profile pads in the last pad column into the shared global set (settings["global_pads"])."""
import json
import shutil
import time

from . import profiles, settings
from .registry import DATA, GLOBAL_PADS


def _filled(c):
    a = c.get("action") or {}
    return bool(c.get("label") or c.get("color") or any(v for k, v in a.items() if k != "type"))


def global_pads(eng):
    if eng.settings.get("global_pads_migrated"):
        return
    gp, notes, touched = dict(eng.settings.get("global_pads") or {}), [], []
    for prof in eng.ordered():
        for cid in GLOBAL_PADS:
            c = prof.get("controls", {}).get(cid)
            if c is None:
                continue
            touched.append((prof, cid))
            if not _filled(c):
                notes.append(f"{prof['name']} {cid}: empty, dropped")
            elif cid not in gp:
                gp[cid] = c
                notes.append(f"{prof['name']} {cid}: moved to the global set ({c.get('label') or 'no label'})")
            elif json.dumps(gp[cid].get("action"), sort_keys=True) == json.dumps(c.get("action"), sort_keys=True):
                notes.append(f"{prof['name']} {cid}: same action as the global pad, dropped (its colour was {c.get('color')})")
            else:
                notes.append(f"{prof['name']} {cid}: CONFLICT, not moved. It was {json.dumps(c)}")
    if touched:
        backup = DATA / "backups" / "profiles-before-global-pads"
        if not backup.exists():
            shutil.copytree(profiles.DIR, backup)
        (backup / "MIGRATION.md").write_text(f"# Global pads migration, {time.strftime('%Y-%m-%d %H:%M')}\n\n" + "\n".join(f"- {n}" for n in notes) + "\n")
        for prof, cid in touched:
            prof["controls"].pop(cid, None)
        for prof in {id(p): p for p, _ in touched}.values():
            profiles.save(prof)
        print("global pads migration:\n  " + "\n  ".join(notes))
    eng.settings["global_pads"] = gp
    eng.settings["global_pads_migrated"] = True
    settings.save(eng.settings)


def window_pads(eng):
    """One-time: the first version stored the 16 window pads in settings["global_pads"] (editable); they are a built-in layer now. Take them out of
    the shared set again (anything else in it stays); profiles' own pads in those places were never touched (they are only covered while the layer is on)."""
    if eng.settings.get("window_pads_builtin"):
        return
    gp = {k: v for k, v in (eng.settings.get("global_pads") or {}).items() if (v.get("action") or {}).get("type") != "window"}
    eng.settings["global_pads"] = gp
    for k in ("window_pads_seeded", "window_pads_fullscreen"):
        eng.settings.pop(k, None)
    eng.settings["window_pads_builtin"] = True
    settings.save(eng.settings)


# The Claude Code buttons that now travel with the Claude usage widget (display/tokens.py widget_buttons), by what they type.
_MOVED = {"/compact\n\n", "/clear\n\n", "/context\n\n", "/usage\n\n"}


def widget_buttons(eng):
    """One-time: drop those four buttons (and the profile's own Master button) from profiles; the widgets bring them now."""
    if eng.settings.get("widget_buttons_migrated"):
        return
    for prof in eng.ordered():
        ctl = prof.get("controls", {})
        gone = [k for k, c in ctl.items() if k.startswith(("btn-upper-", "btn-lower-")) and
                (((c.get("action") or {}).get("type") == "text" and (c.get("action") or {}).get("text") in _MOVED) or (c.get("action") or {}).get("type") == "pin")]
        if gone:
            backup = DATA / "backups" / "profiles-before-widget-buttons"
            if not backup.exists():
                shutil.copytree(profiles.DIR, backup)
            for k in gone:
                ctl.pop(k, None)
            profiles.save(prof)
    eng.settings["widget_buttons_migrated"] = True
    settings.save(eng.settings)


def single_layout(eng):
    """One-time: the Half / Full arrangements become one 8-column layout. A Half arrangement moves to the side opposite the player and the
    player (4 x 2, on its old side) joins the list as a widget; Full arrangements are dropped (backed up with the profiles first)."""
    if eng.settings.get("single_layout_migrated"):
        return
    media = dict(eng.settings.get("media") or {})
    left = media.get("half_layout", "left") != "right"
    player = {"type": "player", "col": 0 if left else 4, "row": 0, "w": 4, "h": 2}

    def convert(d):
        half = d.get("half") if isinstance(d, dict) else None
        return [{**x, "col": x["col"] + (4 if left else 0)} for x in half] + [player] if isinstance(half, list) else None

    shared = eng.settings.get("display_widgets")
    if isinstance(shared, dict):
        eng.settings["display_widgets"] = convert(shared) or []
    for prof in eng.ordered():
        dw = (prof.get("display") or {}).get("widgets")
        if isinstance(dw, dict):
            backup = DATA / "backups" / "profiles-before-single-layout"
            if not backup.exists():
                shutil.copytree(profiles.DIR, backup)
            conv = convert(dw)
            if conv:
                prof["display"]["widgets"] = conv
            else:
                prof["display"].pop("widgets", None)
            profiles.save(prof)
    media.pop("half_layout", None)
    media["mode"] = "half"   # the Layout button hides the player now; a player that is not wanted is simply not in the layout
    eng.settings["media"] = media
    eng.settings["single_layout_migrated"] = True
    settings.save(eng.settings)


def player_overlay(eng):
    """One-time: a large (4 x 2) player in a layout list becomes the Layout button's overlay: it leaves the list and its half is remembered as
    the profile's player_side (the shared one as settings["player_side"]). The widgets stay where they are."""
    if eng.settings.get("player_overlay_migrated"):
        return

    def split(lst):
        big = next((x for x in lst if x.get("type") == "player" and x.get("w", 2) >= 4), None)
        return ([x for x in lst if x is not big], "right" if big and big.get("col", 0) >= 4 else "left") if big else (lst, None)

    shared = eng.settings.get("display_widgets")
    if isinstance(shared, list):
        eng.settings["display_widgets"], side = split(shared)
        if side:
            eng.settings["player_side"] = side
    for prof in eng.ordered():
        lst = (prof.get("display") or {}).get("widgets")
        if isinstance(lst, list):
            new, side = split(lst)
            if side:
                prof["display"]["widgets"], prof["display"]["player_side"] = new, side
                profiles.save(prof)
    eng.settings["player_overlay_migrated"] = True
    settings.save(eng.settings)


def alerts_simplified(eng):
    """One-time: the question and limit alerts are a plain on/off now (fixed chime, pads and thresholds): both start on and drop their old choices."""
    if eng.settings.get("alerts_simplified"):
        return
    eng.settings["ask_alert"] = {"on": True}
    eng.settings["limit_alert"] = {"on": True}
    eng.settings["alerts_simplified"] = True
    settings.save(eng.settings)

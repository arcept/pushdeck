"""Profiles: one JSON file per profile in <project>/profiles/.

{ "id", "name", "slot" (scene button 0-7), "match": {"bundle_ids": [...]}, "theme": {"accent","bg"},
  "controls": { "<control-id>": {"label","color":"#rrggbb","action":{...},"risky":bool,
                                   "states":{"active":"#..","error":"#.."}} } }
"""
import json
import shutil
import re

from .registry import CONTROLS, DATA, ROOT

DIR = DATA / "profiles"
DEFAULT_THEME = {"accent": "#d97757", "bg": "#000000"}


def hex_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def load_all() -> dict:
    DIR.mkdir(parents=True, exist_ok=True)
    if DATA != ROOT and not any(DIR.glob("*.json")):   # first run of the packaged app: start from the bundled example profiles
        for src in (ROOT / "profiles").glob("*.json"):
            shutil.copy(src, DIR / src.name)
    out = {}
    for p in sorted(DIR.glob("*.json")):
        try:
            prof = json.loads(p.read_text())
            prof.setdefault("theme", dict(DEFAULT_THEME))
            prof.setdefault("controls", {})
            prof.setdefault("match", {"bundle_ids": []})
            out[prof["id"]] = prof
        except (OSError, ValueError, KeyError) as exc:
            print("bad profile", p.name, exc)
    return out


def validate(prof: dict):
    if not re.fullmatch(r"[a-z0-9-]+", prof.get("id", "")):
        raise ValueError("id must be lowercase letters, digits, dashes")
    for cid in prof.get("controls", {}):
        if cid not in CONTROLS:
            raise ValueError(f"unknown control {cid}")


def save(prof: dict):
    from .registry import GLOBAL_PADS
    prof = {**prof, "controls": {k: v for k, v in prof.get("controls", {}).items() if k not in GLOBAL_PADS}}  # global pads live in settings
    validate(prof)
    (DIR / f"{prof['id']}.json").write_text(json.dumps(prof, indent=2))


def delete(pid: str):
    if not re.fullmatch(r"[a-z0-9-]+", pid or ""):
        raise ValueError("bad profile id")
    path = DIR / f"{pid}.json"
    if path.exists():
        path.unlink()


SLOTS = 16        # scene buttons: 8 on the device, and a second layer of 8 with Shift held


def normalize_slots(profs: dict) -> bool:
    """Every profile gets its own scene slot 0-15: one that is missing, out of range or already used by another profile takes the next free one
    (in the order the profiles were listed). Returns True when something changed (the caller saves). More than 16 profiles: the rest have no scene button."""
    used, changed, order = set(), False, sorted(profs.values(), key=lambda p: (p.get("slot", 99) if isinstance(p.get("slot"), int) else 99, p["id"]))
    for p in order:
        s = p.get("slot")
        if isinstance(s, int) and 0 <= s < SLOTS and s not in used:
            used.add(s)
            continue
        free = next((i for i in range(SLOTS) if i not in used), None)
        if free is None:
            if "slot" in p:
                del p["slot"]
                changed = True
            continue
        p["slot"] = free
        used.add(free)
        changed = True
    return changed


def next_free_slot(profs: dict):
    used = {p.get("slot") for p in profs.values()}
    return next((i for i in range(SLOTS) if i not in used), None)

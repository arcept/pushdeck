"""User settings persisted to settings.json at the project root."""
import json

from .registry import DATA

PATH = DATA / "settings.json"
DEFAULTS = {
    "lifecycle": "login",        # login | manual | login_sleep | ui_only
    "idle_minutes": 10,          # fully off after this long without input
    "brightness": 100,           # pad & button LED brightness 0-100
    "display_brightness": 100,   # 0-100
    "global_knobs": {"knob-swing": "brightness", "knob-master": "volume"},  # Swing: display + pad brightness together; Encoder 1 scrolls the song list when it is open
    "knob_turns_full_range": 2.5,  # full turns of a knob for 0 to 100
    "knob_ticks_per_turn": 128,    # ticks the encoder sends per full turn (measure with the Knob sensitivity test)
    "knob_measured": False,
    "require_touch": True,       # ignore knob turns without a touch (noise guard)
    "standby": False,
    "player_side": "left",       # which half the large player takes when the Layout button shows it (a profile can set its own: display.player_side)
    "claude_theme": "neon",      # the Claude session widget's look (bar + mascot; the mascot also on usage and clock): neon | plasma | classic
    "claude_follow": "busy",     # which Claude session the Claude session widget follows: busy (the one working) | front | recent
    "ask_alert": {"pads": True, "sound": True, "sound_name": "Glass"},   # when Claude asks a question: the pads ripple and glow, a chime plays now and every 20 s until it is answered
    "limit_alert": {"on": True, "levels": [80, 90, 95], "sound": True},   # a usage window crossing these percentages: red panel, red pad ripple, low chime (see limits.py)
    "clock_12h": False,          # clock widgets show 12-hour time (the button on the 2 x 1 clock flips it)
    "claude_context_window": 1_000_000,  # tokens in Claude Code's context window (the context bar's 100 %)
    "onboarded": False,          # the first-run setup has been completed or skipped (Settings can run it again)
    "claude_usage_live": False,  # read Claude's plan usage live from its usage endpoint (uses the Claude login token in the Keychain); see usage.py
    "display_widgets": [],       # the shared widget arrangement (one list); empty = display/tokens.py layout_default
    "global_pads": {},           # pad-<row>-7 -> the same control setup as in a profile; works in every profile
    "window_pad_edits": {},      # pad id -> {label, color, states.active, risky}: what was changed on the built-in window pads (same in every profile)
    "window_pads": True,         # the built-in window pads on the top-left 4 x 4 pads (windows.py): the default for every profile; a profile can say "on" or "off" itself
    "media": {"mode": "half", "style": "none", "idle": "last", "audio": True, "chrome": True, "spotify_desktop": True, "system": True, "auto_show": True, "favorites": []},
    "calibration": {"red": [255, 0, 0], "green": [0, 255, 0], "blue": [0, 0, 255], "saturation": 1.0},
}


def load() -> dict:
    try:
        out = {**DEFAULTS, **json.loads(PATH.read_text())}
    except (OSError, ValueError):
        return dict(DEFAULTS)
    gk = dict(out.get("global_knobs") or {})
    if gk.get("knob-1") == "display" and gk.get("knob-2") == "leds":  # the old two brightness knobs become one, on Swing
        gk.pop("knob-1"), gk.pop("knob-2")
        gk.setdefault("knob-swing", "brightness")
        out["global_knobs"] = gk
    if gk.get("knob-8") == "volume":  # the volume knob moved from Encoder 8 to Master
        gk.pop("knob-8")
        gk.setdefault("knob-master", "volume")
        out["global_knobs"] = gk
    return out


def save(s: dict):
    PATH.parent.mkdir(parents=True, exist_ok=True)
    PATH.write_text(json.dumps(s, indent=2))

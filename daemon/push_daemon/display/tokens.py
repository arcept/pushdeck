"""Single source of truth for the display's design tokens. `python -m push_daemon.display.tokens` writes the copy the
browser renderer imports (ui/src/display/tokens.json)."""
import json
import sys
from pathlib import Path

TOKENS = {
    "canvas": {"w": 960, "h": 160},
    # 8 columns of 120 px sit exactly over the 8 encoders and the 8+8 display buttons.
    "grid": {"cols": 8, "col_w": 120, "zone_w": 105, "zone_h": 24, "zone_margin": 2, "body_top": 30, "body_bottom": 130,
             "pad": 14},
    "color": {
        "bg": "#000000",        # RULE: always pure black
        "ink": "#ffffff", "ink2": "#b4b4c0", "ink3": "#9a9aa8", "ink4": "#3a3a44",
        "track": "#1c1c24", "hairline": "#24242c", "on_accent": "#100e12",
        "good": "#3cdc78", "warn": "#ffbe32", "bad": "#ff5050", "info": "#5aa0ff",
    },
    # Quicksand (main): display, title, value, label. IBM Plex Mono (secondary): caption, note.
    "type": {"display": 60, "title": 38, "value": 26, "metric": 34, "label": 15, "caption": 13, "note": 14},
    "radius": {"chip": 6, "zone": 5, "bar": 3},
    "motion": {"toast_seconds": 1.4},
    # The shared widget arrangement (8 x 2 cells), used by every profile that has none of its own. The whole display is widgets; the large (4 x 2)
    # player is not in the list: the Layout button shows it over the left or right half (the profile's player_side), covering what is there.
    # A compact 2 x 2 player is a normal widget.
    "layout_default": [{"type": "clock", "col": 0, "row": 0, "w": 2, "h": 2}, {"type": "profile", "col": 6, "row": 0, "w": 2, "h": 1}],
    # Widgets that only exist with certain apps: shown (and their buttons live) only on a profile that is for one of these apps.
    # Clock and Profile are global; they are simply not listed.
    "widget_apps": {
        "claude": ["com.apple.Terminal", "com.googlecode.iterm2", "com.mitchellh.ghostty", "dev.warp.Warp-Stable", "com.microsoft.VSCode", "com.anthropic.claudefordesktop"],
        "codex": ["com.openai.chat", "com.openai.codex"],
        "tab": ["com.google.Chrome", "com.apple.Safari", "company.thebrowser.Browser", "com.brave.Browser", "com.microsoft.edgemac"],
    },
    # Display buttons a widget brings with it. `match` picks the widget; `up` / `down` fill the upper / lower button row from the widget's
    # first column; `edge` is one row of buttons that goes above the widget on the top row and below it on the bottom row.
    # A widget's button replaces the profile's own shortcut on that button. "provider" colours a button by its widget's service (else the profile's accent).
    "widget_buttons": [
        # the player's buttons are made by media_ui.py (their labels change with what is playing); listed here so the editor can draw them
        {"match": {"type": "player", "w": 2}, "up": [{"label": "Prev", "icon": "prev"}, {"label": "Next", "icon": "next"}],
         "down": [{"label": "Pause", "icon": "pause"}, {"label": "Save", "icon": "heart"}]},
        # the 2 x 1 clock's buttons change with its state (12 / 24 h, timer): engine.clock_buttons() makes them; these are the resting pair, for the editor
        {"match": {"type": "clock", "w": 2, "h": 1}, "edge": [{"label": "12 hour", "icon": "clock"}, {"label": "Timer", "icon": "timer"}]},
        {"match": {"type": "clock", "w": 2, "h": 2}, "edge": [{"label": "12 hour", "icon": "clock"}, {"label": "Timer", "icon": "timer"}],
         "down": [{"label": "Stopwatch", "icon": "stopwatch"}, {"label": "Pomodoro", "icon": "pomodoro"}]},
        # the Claude session widget: Stop interrupts Claude (Escape to the app in front); the second button picks which session it follows (its label is the current choice)
        {"match": {"type": "claude_session"}, "edge": [{"label": "Stop", "icon": "stop", "action": {"type": "keys", "keys": "escape"}},
                                                        {"label": "Busy", "icon": "eye", "action": {"type": "claude", "op": "follow"}}]},
        # the browser widget: Reload and Favourite (add / remove the active tab) on top; favourites below (4 in the 4-wide, 6 + 2 on top in the 6-wide; live labels from engine.browser_buttons())
        {"match": {"type": "browser", "w": 6}, "up": [{"label": "Reload", "icon": "redo"}, {"label": "Favourite", "icon": "star"}, {"label": "Page", "icon": "grid"}, {"label": ""}, {"label": ""}, {"label": ""}],
         "down": [{"label": ""} for _ in range(6)]},
        {"match": {"type": "browser"}, "up": [{"label": "Reload", "icon": "redo"}, {"label": "Favourite", "icon": "star"}, {"label": "Page", "icon": "grid"}, {"label": ""}],
         "down": [{"label": ""} for _ in range(4)]},
        {"match": {"type": "profile"}, "edge": [{"label": "Master", "icon": "pin", "action": {"type": "pin"}}]},
        {"match": {"type": "usage", "provider": "claude", "which": "both", "h": 2},
         "up": [{"label": "Usage", "icon": "grid", "action": {"type": "text", "text": "/usage\n\n"}},
                {"label": "Context", "icon": "bars", "action": {"type": "text", "text": "/context\n\n"}}],
         "down": [{"label": "Compact", "icon": "compact", "action": {"type": "text", "text": "/compact\n\n"}, "risky": True},
                  {"label": "Clear", "icon": "clear", "action": {"type": "text", "text": "/clear\n\n"}, "risky": True}]},
    ],
}

# Pixel sprites for the Claude session widget (an original little critter, not a copy of anyone's mascot). Rows of characters:
# o = body, l = legs (a darker body), k = eyes, c = claws. Two walking frames; props are held up by the right claw.
SPRITES = {
    "pip": {"frames": [
        ["cc........cc", ".c.oooooo.c.", "..oooooooo..", "..okkookko..", "..oooooooo..", "...oooooo...", "..l.l..l.l..", ".l.l....l.l."],
        ["cc........cc", ".c.oooooo.c.", "..oooooooo..", "..okkookko..", "..oooooooo..", "...oooooo...", ".l.l....l.l.", "..l.l..l.l.."],
    ],
        "sleep": ["..oooooooo..", ".cooooooooc.", "..oooooooo..", "..oooooooo..", "..okkookko..", "...oooooo...", "..l.l..l.l.."]},
    "props": {   # 5 x 5, drawn above the right claw: w white, g grey, y yellow, p pink, e green
        "read": [".www.", "w...w", "w...w", ".wwwg", "....g"],
        "edit": ["....y", "...yy", "..yy.", ".yy..", "p...."],
        "run": ["wwwww", "we.ew", "w.e.w", "wwwww", "..g.."],
        "plan": ["wwwww", "wewww", "wwwww", "wewww", "wwwww"],
        "agent": [".y.y.", "yyyyy", ".yyy.", "yyyyy", ".y.y."],
        "think": [".....", ".w.w.", ".....", "w.w.w", "....."],
        "alert": ["..y..", "..y..", "..y..", ".....", "..y.."],
        "hourglass": ["wwwww", ".wyw.", "..w..", ".yyy.", "wwwww"],
        "cheer": ["y.y.y", ".yyy.", "yyyyy", ".yyy.", "y.y.y"],
    },
    "crew": ["#6aa7ff", "#7ed37f", "#c58bff", "#f5c542"],   # worker body colours, one per running sub-agent
}
TOKENS["sprites"] = SPRITES

if __name__ == "__main__":
    out = Path(__file__).resolve().parents[3] / "ui" / "src" / "display" / "tokens.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(TOKENS, indent=2))
    print("wrote", out, file=sys.stderr)
    (out.parent / "glyphs.json").write_text((Path(__file__).parent / "glyphs.json").read_text())

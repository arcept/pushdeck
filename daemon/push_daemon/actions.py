"""Action executors. Types: keys, text, app, url, shell, shortcut, media, window."""
import subprocess
import time

from . import windows

MODS = {"cmd": "command down", "command": "command down", "shift": "shift down", "alt": "option down",
        "opt": "option down", "option": "option down", "ctrl": "control down", "control": "control down"}
KEYCODES = {"return": 36, "enter": 36, "tab": 48, "space": 49, "delete": 51, "esc": 53, "escape": 53,
            "left": 123, "right": 124, "down": 125, "up": 126, "[": 33, "]": 30}


def _osa(script: str):
    subprocess.Popen(["osascript", "-e", script])


def _fn(down: bool):
    """The Fn (Globe) key is a modifier, not a key: System Events can't type it, so post the same flags-changed event the keyboard sends."""
    import Quartz as Q
    ev = Q.CGEventCreate(None)
    Q.CGEventSetType(ev, Q.kCGEventFlagsChanged)
    Q.CGEventSetIntegerValueField(ev, Q.kCGKeyboardEventKeycode, 63)
    Q.CGEventSetFlags(ev, Q.kCGEventFlagMaskSecondaryFn if down else 0)
    Q.CGEventPost(Q.kCGHIDEventTap, ev)


def keys(combo: str, phase: str = "tap"):
    if combo.strip().lower() in ("fn", "globe"):
        if phase in ("tap", "down"):
            _fn(True)
        if phase == "tap":
            time.sleep(0.05)
        if phase in ("tap", "up"):
            _fn(False)
        return
    parts = [p.strip().lower() for p in combo.split("+")]
    key, mods = parts[-1], [MODS[p] for p in parts[:-1] if p in MODS]
    using = f" using {{{', '.join(mods)}}}" if mods else ""
    if key in KEYCODES:
        _osa(f'tell application "System Events" to key code {KEYCODES[key]}{using}')
    else:
        esc = key.replace('"', '\\"')
        _osa(f'tell application "System Events" to keystroke "{esc}"{using}')


def type_text(text: str):
    """Type text; each newline is a real Return key press (keystroke would send a line feed, which chat boxes and
    terminals treat as a soft newline instead of 'send'). A short pause before Return lets the app catch up,
    e.g. Claude Code's slash-command menu."""
    lines = text.replace("\r\n", "\n").split("\n")
    steps = []
    for i, line in enumerate(lines):
        if line:
            esc = line.replace("\\", "\\\\").replace('"', '\\"')
            steps.append(f'keystroke "{esc}"')
        if i < len(lines) - 1:
            steps += ["delay 0.4" if (i > 0 and not line) else "delay 0.15", "key code 36"]   # a second Return in a row waits longer: the app is filling in a menu choice
    if steps:
        _osa('tell application "System Events"\n' + "\n".join(steps) + "\nend tell")


MEDIA = {
    "play_pause": 'tell application "System Events" to key code 100',  # F8 (play/pause)
    "next": 'tell application "System Events" to key code 101',
    "prev": 'tell application "System Events" to key code 98',
    "volume_up": "set volume output volume ((output volume of (get volume settings)) + 6)",
    "volume_down": "set volume output volume ((output volume of (get volume settings)) - 6)",
    "mute": "set volume output muted not (output muted of (get volume settings))",
}


def holds(action: dict) -> bool:
    """A held shortcut presses its key down when the pad goes down and lets go when the pad is released (only Fn can be held)."""
    return action.get("type") == "keys" and bool(action.get("hold")) and str(action.get("keys", "")).strip().lower() in ("fn", "globe")


def release(action: dict):
    if holds(action):
        keys(action["keys"], "up")


def run(action: dict):
    t = action.get("type")
    if t == "keys":
        keys(action["keys"], "down" if holds(action) else "tap")
    elif t == "text":
        type_text(action["text"])
    elif t == "app":
        subprocess.Popen(["open", "-a", action["name"]])
    elif t == "url":
        subprocess.Popen(["open", action["url"]])
    elif t == "shell":
        subprocess.Popen(action["command"], shell=True)
    elif t == "shortcut":
        subprocess.Popen(["shortcuts", "run", action["name"]])
    elif t == "media":
        _osa(MEDIA[action["name"]])
    elif t == "window":
        windows.server.send(action["op"])
    else:
        raise ValueError(f"unknown action type {t!r}")

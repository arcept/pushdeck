"""One sound per kind of alert, so they can be told apart without looking. macOS's own system sounds; a setting "sounds" {event: name} can override any."""
import subprocess

FOLDER = "/System/Library/Sounds/"
SOUNDS = {
    "question": "Glass",        # Claude asked something
    "limit": "Basso",           # a usage limit was crossed (low and heavy)
    "timer": "Hero",            # the countdown timer ran out
    "pomo_break": "Bottle",     # a pomodoro focus round ended: break time
    "pomo_long": "Submarine",   # ... and it is the long break
    "pomo_focus": "Morse",      # a break ended: back to work
    "lap": "Tink",              # a stopwatch lap
}


def play(event, settings=None):
    name = ((settings or {}).get("sounds") or {}).get(event) or SOUNDS.get(event)
    if not name:
        return
    try:
        subprocess.Popen(["afplay", f"{FOLDER}{name}.aiff"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass

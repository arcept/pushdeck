"""The window pads: move and size the front app's focused window. The work is done by the app's own binary in a helper mode
(`PushMenu --windows`, menubar/Sources/PushMenu/WindowServer.swift): macOS keeps Accessibility per app, so the Push Deck entry in System
Settings covers it. It starts on the first press, gets one layout name per line and answers one JSON line, and ends by itself after
10 idle minutes (or when this daemon goes away: the pipe closes). Layout names follow Rectangle (MIT, github.com/rxhanson/Rectangle)."""
import json
import os
import subprocess
import threading

from .registry import ROOT

OPS = ["top-left", "top-half", "top-right", "left-half", "right-half", "bottom-left", "bottom-half", "bottom-right",
       "first-third", "center-third", "last-third", "maximize", "center", "restore", "full-screen", "close", "minimize", "next-display", "previous-display"]

QUARTER, HALF, THIRD, FILL, DISPLAY = "#a259ff", "#1abcfe", "#0acf83", "#ffcd29", "#e6e6e6"   # one colour per family


def _pad(label, op, color):
    return {"label": label, "color": color, "action": {"type": "window", "op": op}}


# The top-left 4 x 4 pads, laid out like the screen: quarters at the corners, halves on the edges between them.
DEFAULT_PADS = {
    "pad-0-0": _pad("Top left", "top-left", QUARTER), "pad-0-1": _pad("Top half", "top-half", HALF),
    "pad-0-2": _pad("Top right", "top-right", QUARTER), "pad-0-3": _pad("Maximize", "maximize", FILL),
    "pad-1-0": _pad("Left half", "left-half", HALF), "pad-1-1": _pad("Center", "center", FILL),
    "pad-1-2": _pad("Right half", "right-half", HALF), "pad-1-3": _pad("Full screen", "full-screen", FILL),
    "pad-2-0": _pad("Bottom left", "bottom-left", QUARTER), "pad-2-1": _pad("Bottom half", "bottom-half", HALF),
    "pad-2-2": _pad("Bottom right", "bottom-right", QUARTER), "pad-2-3": _pad("Next display", "next-display", DISPLAY),
    "pad-3-0": _pad("First third", "first-third", THIRD), "pad-3-1": _pad("Center third", "center-third", THIRD),
    "pad-3-2": _pad("Last third", "last-third", THIRD), "pad-3-3": _pad("Previous display", "previous-display", DISPLAY),
}

def layer(settings) -> dict:
    """The built-in pads with what the owner changed on them (settings["window_pad_edits"]: name, colour, colour while pressed, confirm-before-running; the action is fixed)."""
    edits = settings.get("window_pad_edits") or {}
    out = {}
    for cid, ctl in DEFAULT_PADS.items():
        e = edits.get(cid) or {}
        c = dict(ctl)
        if isinstance(e.get("label"), str) and e["label"].strip():
            c["label"] = e["label"][:24]
        if isinstance(e.get("color"), str) and e["color"].startswith("#") and len(e["color"]) in (4, 7):
            c["color"] = e["color"]
        active = (e.get("states") or {}).get("active") if isinstance(e.get("states"), dict) else None
        if isinstance(active, str) and active.startswith("#") and len(active) in (4, 7):
            c["states"] = {"active": active}
        if e.get("risky") is True:
            c["risky"] = True
        out[cid] = c
    return out


def enabled(settings, prof) -> bool:
    """Are the window pads on for this profile? The profile's own choice ("on" / "off") wins; otherwise the global switch (default on)."""
    mode = (prof or {}).get("window_pads")
    return mode == "on" if mode in ("on", "off") else bool(settings.get("window_pads", True))


WHY = {"accessibility": "Windows need Accessibility for Push Deck", "no window": "No window to move", "minimized": "That window is minimized",
       "only one display": "Only one display", "no app in front": "No app in front",
       "no display": "No display found", "nothing to restore": "Nothing to restore", "full screen not supported": "This app can't change full screen",
       "can't close": "This window can't be closed from here", "can't minimize": "This window can't be minimized"}


class Server:
    def __init__(self):
        self.proc = None
        self.lock = threading.Lock()
        self.on_failure = None   # called with a short text (from another thread) when a layout could not be applied

    @staticmethod
    def exe():
        """The app's binary when running inside it; in development the newest build in menubar/.build or build/swift."""
        exe = os.environ.get("PUSH_APP_EXE")
        if exe and os.path.exists(exe):
            return exe
        found = [p for p in (ROOT / "menubar" / ".build" / k / "PushMenu" for k in ("debug", "release")) if p.exists()]
        found += [p for p in [ROOT / "build" / "swift" / "release" / "PushMenu"] if p.exists()]
        return str(max(found, key=lambda p: p.stat().st_mtime)) if found else None

    def _start(self):
        exe = self.exe()
        if not exe:
            raise RuntimeError("window helper not built: run swift build in menubar/")
        self.proc = subprocess.Popen([exe, "--windows"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        threading.Thread(target=self._read, args=(self.proc,), daemon=True).start()

    def _read(self, proc):
        for line in proc.stdout:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if not r.get("ok") and self.on_failure:
                err = str(r.get("err") or "")
                self.on_failure(WHY.get(err, err or "Window action failed"))

    def send(self, op: str):
        if op not in OPS:
            raise ValueError(f"unknown window layout {op!r}")
        with self.lock:
            for attempt in (0, 1):   # the helper ends itself when idle: start a fresh one and say it again
                if self.proc is None or self.proc.poll() is not None:
                    self._start()
                try:
                    self.proc.stdin.write(op + "\n")
                    self.proc.stdin.flush()
                    return
                except (BrokenPipeError, OSError):
                    self.proc = None
            raise RuntimeError("window helper not running")


server = Server()

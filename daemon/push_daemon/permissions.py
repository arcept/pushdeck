"""macOS permission checks for the first-run setup. Only Accessibility can be read; Automation and audio capture are asked by macOS
the first time a feature needs them, so for those the setup just opens the right System Settings page."""
import ctypes
import json
import os
import subprocess
import time

PANES = {"accessibility": "Privacy_Accessibility", "automation": "Privacy_Automation", "audio": "Privacy_AudioCapture"}


def _app(args):
    """Ask the Push Deck app itself (PushMenu --perm …). macOS keeps permissions per app, and the daemon is a separate Python program,
    so only the app can say what the Push Deck entry in System Settings allows. None when not running inside the app (dev mode)."""
    exe = os.environ.get("PUSH_APP_EXE")
    if not exe or not os.path.exists(exe):
        return None
    try:
        out = subprocess.run([exe, "--perm", *args], capture_output=True, text=True, timeout=120).stdout
        return json.loads(out.strip().splitlines()[-1])
    except Exception:
        return None


def accessibility():
    """True / False, or None when the check is not available (the setup then does not block on it)."""
    r = _app([])
    if r is not None:
        return bool(r.get("accessibility"))
    try:
        lib = ctypes.CDLL("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")
        lib.AXIsProcessTrusted.restype = ctypes.c_bool
        return bool(lib.AXIsProcessTrusted())
    except Exception:
        return None


# Automation: ask macOS whether we may send Apple events to each app we control. Only answers while the app is running.
# System Events is the hidden part of macOS that presses keys for shortcut actions; it is started quietly so it can be checked.
TARGETS = {"com.apple.systemevents": "System Events", "com.google.Chrome": "Google Chrome", "com.spotify.client": "Spotify"}
_STATE = {0: "granted", -1743: "denied", -1744: "unknown", -600: "not_running"}
_started = {"systemevents": 0.0}


def _determine(bundle, ask):
    lib = ctypes.CDLL("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")

    class AEDesc(ctypes.Structure):
        _fields_ = [("descriptorType", ctypes.c_uint32), ("dataHandle", ctypes.c_void_p)]

    lib.AECreateDesc.argtypes = [ctypes.c_uint32, ctypes.c_void_p, ctypes.c_long, ctypes.POINTER(AEDesc)]
    lib.AECreateDesc.restype = ctypes.c_int16
    lib.AEDeterminePermissionToAutomateTarget.argtypes = [ctypes.POINTER(AEDesc), ctypes.c_uint32, ctypes.c_uint32, ctypes.c_ubyte]
    lib.AEDeterminePermissionToAutomateTarget.restype = ctypes.c_int32
    lib.AEDisposeDesc.argtypes = [ctypes.POINTER(AEDesc)]
    fcc = lambda t: int.from_bytes(t.encode(), "big")
    raw, desc = bundle.encode(), AEDesc()
    if lib.AECreateDesc(fcc("bund"), raw, len(raw), ctypes.byref(desc)) != 0:
        return "unknown"
    status = lib.AEDeterminePermissionToAutomateTarget(ctypes.byref(desc), fcc("****"), fcc("****"), 1 if ask else 0)
    lib.AEDisposeDesc(ctypes.byref(desc))
    return _STATE.get(status, "unknown")


def automation():
    """{bundle id: granted | denied | unknown (never asked) | not_running}, or None when the check is not available. Never prompts."""
    try:
        r = _app(list(TARGETS))
        out = {b: _STATE.get(r.get(b), "unknown") for b in TARGETS} if r is not None else {b: _determine(b, False) for b in TARGETS}
        if out.get("com.apple.systemevents") == "not_running" and time.time() - _started["systemevents"] > 10:
            _started["systemevents"] = time.time()   # start it hidden; the next check (1.5 s later) can read it
            subprocess.Popen(["open", "-g", "-j", "-b", "com.apple.systemevents"])
        return out
    except Exception:
        return None


def ask_automation(bundle):
    """Show macOS's own "allow Push Deck to control …" prompt for one app (blocks until answered; run it off the event loop)."""
    if bundle in TARGETS:
        try:
            if _app(["--ask", bundle]) is None:
                _determine(bundle, True)
        except Exception:
            pass


def open_pane(name):
    pane = PANES.get(name)
    if pane:
        subprocess.Popen(["open", f"x-apple.systempreferences:com.apple.preference.security?{pane}"])

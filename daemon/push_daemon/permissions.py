"""macOS permission checks for the first-run setup. Only Accessibility can be read; Automation and audio capture are asked by macOS
the first time a feature needs them, so for those the setup just opens the right System Settings page."""
import ctypes
import subprocess

PANES = {"accessibility": "Privacy_Accessibility", "automation": "Privacy_Automation", "audio": "Privacy_AudioCapture"}


def accessibility():
    """True / False, or None when the check is not available (the setup then does not block on it)."""
    try:
        lib = ctypes.CDLL("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")
        lib.AXIsProcessTrusted.restype = ctypes.c_bool
        return bool(lib.AXIsProcessTrusted())
    except Exception:
        return None


# Automation: ask macOS, without prompting, whether we may send Apple events to each app we control. Only works while the app is running.
TARGETS = {"com.google.Chrome": "Google Chrome", "com.spotify.client": "Spotify", "com.apple.systemevents": "System Events"}
_STATE = {0: "granted", -1743: "denied", -1744: "unknown", -600: "not_running"}


def automation():
    """{bundle id: granted | denied | unknown (never asked) | not_running}, or None when the check is not available."""
    try:
        lib = ctypes.CDLL("/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices")

        class AEDesc(ctypes.Structure):
            _fields_ = [("descriptorType", ctypes.c_uint32), ("dataHandle", ctypes.c_void_p)]

        lib.AECreateDesc.argtypes = [ctypes.c_uint32, ctypes.c_void_p, ctypes.c_long, ctypes.POINTER(AEDesc)]
        lib.AECreateDesc.restype = ctypes.c_int16
        lib.AEDeterminePermissionToAutomateTarget.argtypes = [ctypes.POINTER(AEDesc), ctypes.c_uint32, ctypes.c_uint32, ctypes.c_ubyte]
        lib.AEDeterminePermissionToAutomateTarget.restype = ctypes.c_int32
        lib.AEDisposeDesc.argtypes = [ctypes.POINTER(AEDesc)]
        fcc = lambda s: int.from_bytes(s.encode(), "big")
        out = {}
        for bundle in TARGETS:
            raw = bundle.encode()
            desc = AEDesc()
            if lib.AECreateDesc(fcc("bund"), raw, len(raw), ctypes.byref(desc)) != 0:
                out[bundle] = "unknown"
                continue
            status = lib.AEDeterminePermissionToAutomateTarget(ctypes.byref(desc), fcc("****"), fcc("****"), 0)
            lib.AEDisposeDesc(ctypes.byref(desc))
            out[bundle] = _STATE.get(status, "unknown")
        return out
    except Exception:
        return None


def open_pane(name):
    pane = PANES.get(name)
    if pane:
        subprocess.Popen(["open", f"x-apple.systempreferences:com.apple.preference.security?{pane}"])

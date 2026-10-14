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


def open_pane(name):
    pane = PANES.get(name)
    if pane:
        subprocess.Popen(["open", f"x-apple.systempreferences:com.apple.preference.security?{pane}"])

"""Bundle id of the app that has keyboard focus: the one you last clicked or switched to (not the one under the pointer)."""
import subprocess


def bundle_id():
    try:
        from AppKit import NSWorkspace
        from Foundation import NSDate, NSRunLoop
        # NSWorkspace only learns about app switches while the run loop runs; this process never starts one,
        # so without this the answer stays frozen at whatever was in front when the daemon started.
        NSRunLoop.currentRunLoop().runUntilDate_(NSDate.dateWithTimeIntervalSinceNow_(0.005))
        app = NSWorkspace.sharedWorkspace().frontmostApplication()
        return str(app.bundleIdentifier() or "")
    except Exception:  # noqa: BLE001
        return _lsappinfo()


def _lsappinfo():
    try:
        asn = subprocess.run(["lsappinfo", "front"], capture_output=True, text=True, timeout=1).stdout.strip()
        out = subprocess.run(["lsappinfo", "info", "-only", "bundleid", asn], capture_output=True, text=True, timeout=1).stdout
        return out.split("=")[-1].strip().strip('"') if "=" in out else ""
    except Exception:  # noqa: BLE001
        return ""

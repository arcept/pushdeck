import asyncio

try:   # the daemon uses AppKit for icons and the front app; without this macOS gives the Python process its own bouncing Dock icon
    from AppKit import NSApplication, NSApplicationActivationPolicyAccessory
    NSApplication.sharedApplication().setActivationPolicy_(NSApplicationActivationPolicyAccessory)
except Exception:  # noqa: BLE001
    pass

import os
import threading
import time

from .server import main


def _follow_parent():
    """Started by the app: when the app goes away (quit, crash, force quit) this process goes with it instead of staying behind."""
    ppid = int(os.environ.get("PUSH_PARENT_PID") or 0)
    if not ppid:
        return
    def watch():
        while True:
            time.sleep(2)
            try:
                os.kill(ppid, 0)
            except OSError:
                os._exit(0)
    threading.Thread(target=watch, daemon=True).start()


_follow_parent()


try:
    asyncio.run(main())
except KeyboardInterrupt:
    pass

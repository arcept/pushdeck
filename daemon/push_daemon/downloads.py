"""Downloads in progress, for the browser widget and the download widget. Watches ~/Downloads for the partial files browsers leave while they
download (.crdownload for Chrome / Brave / Edge / Arc, .download for Safari, .part), so it needs no permission beyond that folder."""
import os
import time

PARTIAL = (".crdownload", ".download", ".part", ".opdownload")
STALE = 20.0          # a partial file that has not changed for this long is a paused or abandoned download
FLASH = 6.0           # how long 'downloaded' stays on the display


def _size(path):
    try:
        if os.path.isdir(path):                         # Safari's .download is a folder
            return sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(path) for f in fs)
        return os.path.getsize(path)
    except OSError:
        return 0


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1000 or unit == "GB":
            return f"{n:.0f} {unit}" if unit in ("B", "KB") else f"{n:.1f} {unit}"
        n /= 1000


class Tracker:
    def __init__(self, folder=None):
        self.folder = folder or os.path.expanduser("~/Downloads")
        self.seen = {}            # path -> {"size", "at", "speed"}
        self.done = None          # {"name", "size", "at"}

    def poll(self):
        now = time.time()
        live = {}
        try:
            entries = list(os.scandir(self.folder))
        except OSError:
            return
        for e in entries:
            if not e.name.endswith(PARTIAL):
                continue
            try:
                if now - e.stat().st_mtime > STALE:
                    continue
            except OSError:
                continue
            size, prev = _size(e.path), self.seen.get(e.path)
            speed = prev["speed"] if prev else 0.0
            if prev and now > prev["at"]:
                inst = max(0.0, (size - prev["size"]) / (now - prev["at"]))
                speed = inst if not speed else speed * 0.6 + inst * 0.4
            live[e.path] = {"size": size, "at": now, "speed": speed}
        for path, st in self.seen.items():
            if path not in live:                        # it has gone: finished when the real file is there
                final = path.rsplit(".", 1)[0]
                if os.path.exists(final):
                    self.done = {"name": os.path.basename(final), "size": _size(final), "at": now}
        self.seen = live

    def view(self):
        """{"active": bool, "name", "size", "speed", "done": bool} for the widgets."""
        now = time.time()
        if self.seen:
            path, st = max(self.seen.items(), key=lambda kv: kv[1]["size"])
            name = os.path.basename(path).rsplit(".", 1)[0]
            return {"active": True, "name": name, "size": human(st["size"]), "speed": f"{human(st['speed'])}/s" if st["speed"] > 1000 else "", "done": False}
        if self.done and now - self.done["at"] < FLASH:
            return {"active": False, "name": self.done["name"], "size": human(self.done["size"]), "speed": "", "done": True}
        return {"active": False, "name": "", "size": "", "speed": "", "done": False}

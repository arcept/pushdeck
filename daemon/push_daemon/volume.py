"""System volume control that cannot drift.

Knob ticks are accumulated into one pending delta; a single worker applies it relative to the REAL current volume
(read just before each change), so there are no out-of-order osascript processes and no stale cached value.
"""
from __future__ import annotations

import subprocess
import threading


def read() -> int | None:
    try:
        out = subprocess.run(["osascript", "-e", "output volume of (get volume settings)"], capture_output=True,
                             text=True, timeout=3).stdout.strip()
        return max(0, min(100, int(out)))
    except Exception:  # noqa: BLE001  (e.g. 'missing value' on outputs without a volume)
        return None


def write(v: int):
    subprocess.run(["osascript", "-e", f"set volume output volume {int(v)}"], timeout=3)


class Volume(threading.Thread):
    """Knob turns set an absolute target (the newest wins); one worker writes it. The value shown comes from the target, never
    from a read taken while a write is still in flight, which is what made the number jump back and forth."""

    def __init__(self, on_value):
        super().__init__(daemon=True)
        self.on_value = on_value  # called from the worker thread with the real volume once things settle (or None)
        self.target: float | None = None
        self.last_written: int | None = None
        self.want_read = False
        self.lock = threading.Lock()
        self.ev = threading.Event()
        self.start()

    def set_target(self, v: float):
        with self.lock:
            self.target = max(0.0, min(100.0, v))
        self.ev.set()

    def request_read(self):
        self.want_read = True
        self.ev.set()

    def run(self):
        while True:
            self.ev.wait()
            self.ev.clear()
            wrote = False
            while True:
                with self.lock:
                    t, self.target = self.target, None
                if t is None:
                    break
                new = int(round(t))
                if new != self.last_written:
                    write(new)
                    self.last_written = new
                wrote = True
            if self.want_read or wrote:
                self.want_read = False
                cur = read()
                if cur is not None:
                    self.last_written = cur
                self.on_value(cur)

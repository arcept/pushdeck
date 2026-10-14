"""Usage-limit alerts: when a Claude (or Codex) limit crosses a threshold the Push says so, in the error colour.

Every 5 s it reads the usage numbers (cached by usage.py). The first time a window passes a level (80, 90, 95 % by default) it shows a red
panel for 12 s, ripples the pads in red and plays a low chime. Any button press dismisses it. Each level is announced once per window: what has
been announced is kept in settings (limit_seen) so a restart does not repeat it."""
import time

from . import settings as settings_mod, sounds, usage

LEVELS = [70, 80, 90, 95]                      # fixed: the only choice is on or off
RED, DEEP = (255, 60, 60), (150, 10, 20)
WINDOWS = {"five_hour": "5-HOUR", "seven_day": "WEEKLY"}


def _in(secs):
    secs = int(max(0, secs))
    return f"{secs // 86400}d {secs % 86400 // 3600}h" if secs >= 86400 else f"{secs // 3600}h {secs % 3600 // 60:02d}m" if secs >= 3600 else f"{secs // 60}m"


class Limits:
    def __init__(self, eng):
        self.eng = eng
        self.alert = None
        self.until = 0.0
        self.pads_until = 0.0
        self.alerting = False
        self.start = 0.0
        self.next_check = 0.0

    def cfg(self):
        return {"on": bool((self.eng.settings.get("limit_alert") or {}).get("on", True)), "levels": LEVELS, "sound": True}

    def tick(self):
        now = time.time()
        was = self.alerting
        self.alerting = now < self.pads_until
        if was and not self.alerting:
            self.eng._leds_for = None
        cfg = self.cfg()
        if not cfg["on"] or now < self.next_check:
            return
        self.next_check = now + 5
        seen = self.eng.settings.setdefault("limit_seen", {})
        for prov, (name, _color, fn) in usage.PROVIDERS.items():
            try:
                data = fn() or {}
            except Exception:  # noqa: BLE001
                continue
            for win, label in WINDOWS.items():
                w = data.get(win) or {}
                pct, resets = w.get("used_percentage"), w.get("resets_at") or 0
                if pct is None:
                    continue
                level = max([lv for lv in cfg["levels"] if pct >= lv], default=0)
                key, window_id = f"{prov}.{win}", int(resets // 600)
                s = seen.get(key) or {}
                if level and (s.get("w") != window_id or level > s.get("level", 0)):
                    seen[key] = {"w": window_id, "level": level}
                    settings_mod.save(self.eng.settings)
                    self.fire(name, label, pct, resets, level)
                    return

    def fire(self, name, label, pct, resets, level):
        now = time.time()
        self.alert = {"type": "limit", "name": name.upper(), "window": label, "pct": int(round(pct)), "level": level, "resets": _in(resets - now) if resets else ""}
        self.start, self.until, self.pads_until = now, now + 12, now + 18
        if self.cfg()["sound"]:
            sounds.play("limit", self.eng.settings)

    def active(self):
        return bool(self.alert) and time.time() < self.until

    def dismiss(self):
        self.until = self.pads_until = 0.0
        self.eng._leds_for = None

    def scene(self):
        if not self.active():
            return None
        return {"accent": "#ff4d4d", "zones": {}, "active": [], "no_zones": True, "toast": None,
                "widgets": [{**self.alert, "col": 0, "span": 8, "level_blink": int((time.time() - self.start) * 3) % 2}]}

    def paint_pads(self):
        from . import pads
        if self.alerting and self.eng.push.connected:
            pads.ripple(self.eng.push, time.time() - self.start, RED, DEEP, 1.0)

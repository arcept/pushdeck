"""Usage-limit alerts: when a Claude (or Codex) limit climbs past a level the Push says so, with a full-screen alert that tells the
5-hour session limit from the weekly one (colour, icon and a big label).

Every 5 s it reads the usage numbers (cached by usage.py). Levels are 70 % and every 5 % after it, up to 100 %. A level is announced once per
usage window: what has been announced is kept in settings (limit_seen), so neither a new message nor a restart repeats it. A window counts as the
same while its reset time stays within half an hour of the saved one (the reset time from the API wobbles by a fraction of a second), and as
new when it moves further than that or the usage falls back well below the announced level. An alert plays one chime and a short pad ripple,
then stays on the display for up to 60 s or until any button is pressed. Alerts that arrive together (or while the Push is off or away) wait their turn."""
import time

from . import settings as settings_mod, sounds, usage

LEVELS = list(range(70, 101, 5))               # 70, 75 ... 100 %: the only choice is on or off
HOLD = 60.0                                    # seconds an alert stays up unless a button is pressed
RIPPLE = 6.0                                   # seconds the pads ripple at the start
SAME_WINDOW = 1800                             # reset times closer than this (seconds) are the same usage window
WINDOWS = {"five_hour": ("5-Hour", "clock", (255, 176, 64)), "seven_day": ("Weekly", "calendar", (176, 126, 255))}   # label, icon, colour when it starts to matter
RED = (255, 77, 77)


def _in(secs):
    secs = int(max(0, secs))
    return f"{secs // 86400}d {secs % 86400 // 3600}h" if secs >= 86400 else f"{secs // 3600}h {secs % 3600 // 60:02d}m" if secs >= 3600 else f"{secs // 60}m"


def _mix(a, b, t):
    return [round(x + (y - x) * t) for x, y in zip(a, b)]


def severity(pct):
    """0 at the first level, 1 at 100 %: how far the colour has gone from its own towards red."""
    return max(0.0, min(1.0, (pct - LEVELS[0]) / (100 - LEVELS[0])))


def message(pct):
    return "Limit reached. Wait for the reset" if pct >= 100 else "Almost out" if pct >= 90 else "Running low: slow down or switch tasks" if pct >= 80 else "Getting close"


class Limits:
    def __init__(self, eng):
        self.eng = eng
        self.alert = None
        self.queue = []                        # alerts waiting for the display
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
        if not cfg["on"]:
            self.queue.clear()
            return
        if now >= self.next_check:
            self.next_check = now + 5
            self.look(cfg, now)
        eng = self.eng
        if self.queue and now >= self.until and eng.push.connected and not eng.asleep and not eng.standby:
            self.show(self.queue.pop(0), now)  # the display is free and someone is there to see it

    def look(self, cfg, now):
        """Read the numbers; queue an alert for every limit that climbed past a new level."""
        seen = self.eng.settings.setdefault("limit_seen", {})
        changed = False
        for prov, (name, _color, fn) in usage.PROVIDERS.items():
            try:
                data = fn() or {}
            except Exception:  # noqa: BLE001
                continue
            for win in WINDOWS:
                w = data.get(win) or {}
                pct, resets = w.get("used_percentage"), w.get("resets_at") or 0
                if pct is None:
                    continue
                level = max([lv for lv in cfg["levels"] if pct >= lv], default=0)
                key = f"{prov}.{win}"
                s = seen.get(key) or {}
                saved_reset = s.get("resets", s.get("w", 0) * 600)    # (old saves kept the reset time in 10-minute steps, under "w")
                new_window = abs(resets - saved_reset) > SAME_WINDOW or pct < s.get("level", 0) - 10
                last = 0 if new_window else s.get("level", 0)
                if new_window and s.get("level", 0) != 0 and not level:
                    seen[key] = {"resets": resets, "level": 0}        # a fresh window: forget the old level so the next climb is announced
                    changed = True
                if level and level > last:
                    seen[key] = {"resets": resets, "level": level}
                    changed = True
                    self.enqueue(prov, name, win, pct, resets, level)
        if changed:
            settings_mod.save(self.eng.settings)

    @staticmethod
    def _alert(name, win, pct, resets, level):
        label, icon, base = WINDOWS[win]
        return {"type": "limit", "name": name, "window": label, "icon": icon, "pct": int(round(pct)), "level": level, "reset_at": resets,
                "color": _mix(base, RED, severity(pct))}

    def enqueue(self, prov, name, win, pct, resets, level):
        alert, key = self._alert(name, win, pct, resets, level), (prov, win)
        for i, (k, _) in enumerate(self.queue):   # a newer level for the same limit replaces the one still waiting
            if k == key:
                self.queue[i] = (key, alert)
                return
        self.queue.append((key, alert))

    def preview(self, win, pct):
        """The settings' Preview buttons: show an example alert now. Nothing is saved or counted as announced."""
        if win in WINDOWS:
            now = time.time()
            self.show(((), self._alert("Claude", win, pct, now + (8040 if win == "five_hour" else 3 * 86400 + 4 * 3600), pct)), now)

    def show(self, item, now):
        _, alert = item
        self.alert = alert
        self.start, self.until, self.pads_until = now, now + HOLD, now + RIPPLE
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
        now = time.time()
        a = self.alert
        w = {**a, "col": 0, "span": 8, "age": round(now - self.start, 1), "closes": int(self.until - now) + 1,
             "resets": _in(a["reset_at"] - now) if a.get("reset_at") else "", "msg": message(a["pct"])}
        w.pop("reset_at", None)
        return {"accent": "#%02x%02x%02x" % tuple(a["color"]), "zones": {}, "active": [], "no_zones": True, "toast": None, "widgets": [w]}

    def paint_pads(self):
        from . import pads
        if self.alerting and self.eng.push.connected and self.alert:
            c = self.alert["color"]
            pads.ripple(self.eng.push, time.time() - self.start, tuple(c), tuple(round(v * 0.45) for v in c), 1.0)

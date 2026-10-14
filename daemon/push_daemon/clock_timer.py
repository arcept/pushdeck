"""The timer that the 2 x 1 clock widget turns into. State is global (one timer): every 2 x 1 clock shows it.

off   -> the clock; its buttons are 12 / 24 hour and Timer
set   -> the left encoder over the clock sets the time (1 min steps up to 10 min, then 5 min up to 2 h); buttons Start and Clock
run   -> counting down; buttons Pause and End
pause -> buttons Resume and End
done  -> reached zero: the card flashes, the Mac plays a sound, the buttons pulse; Dismiss or Again

The same card also runs two other modes (self.kind): "pomo" (25 min focus, 5 min break, a 15 min break after every fourth focus; it
rolls on by itself with a chime) and "watch" (a stopwatch with laps). Both only use the states run / pause, and are started from the
two lower buttons under the 2 x 2 clock.
"""
import math
import time

from . import pads, sounds

TICKS_PER_STEP = 4          # encoder ticks per step, like the Browse list
MIN, MAX = 60, 7200
PHASES = {"focus": (25 * 60, "Focus", "#d97757"), "break": (5 * 60, "Break", "#7ed37f"), "long": (15 * 60, "Long break", "#6aa7ff")}
# the pads ripple while something wants you: (inner, outer) colours per kind of alert
RIPPLE = {"timer": ((255, 176, 64), (255, 90, 20)), "focus": ((255, 110, 80), (200, 40, 20)), "break": ((120, 230, 140), (20, 120, 60)),
          "long": ((110, 170, 255), (30, 60, 200)), "lap": ((255, 255, 255), (90, 120, 255))}


def _clock(label, icon, op, **kw):
    return {"label": label, "icon": icon, "action": {"type": "clock", "op": op}, **kw}


class Timer:
    def __init__(self):
        self.state, self.set, self.end, self.left, self.acc = "off", 300, 0.0, 0.0, 0
        self.kind = "timer"                 # timer | pomo | watch
        self.phase, self.cycle, self.phase_at = "focus", 0, 0.0      # pomodoro: where it is, focus rounds finished, when the phase changed
        self.since, self.base, self.laps = 0.0, 0.0, []
        self.pad_kind, self.pad_at, self.pad_until, self.rippling = "", 0.0, 0.0, False   # the pad ripple of the latest alert             # stopwatch: running since, time before that, lap times

    def elapsed(self):
        return self.base + (time.time() - self.since if self.state == "run" else 0.0)

    def remaining(self):
        if self.kind == "pomo":
            return max(0.0, self.end - time.time()) if self.state == "run" else self.left
        return max(0.0, self.end - time.time()) if self.state == "run" else self.left if self.state in ("pause", "done") else float(self.set)

    def controls(self):
        """The buttons that drive the stopwatch or the pomodoro."""
        run = self.state == "run"
        if self.kind == "watch":
            return [_clock("Stop", "pause", "pause"), _clock("Lap", "flag", "lap")] if run else [_clock("Start", "play", "resume"), _clock("Reset", "redo", "reset")]
        return [_clock("Pause", "pause", "pause"), _clock("Skip", "next", "skip")] if run else [_clock("Resume", "play", "resume"), _clock("Skip", "next", "skip")]

    def buttons(self, eng, tall=False):
        """The two buttons on the clock's own edge (dicts like widget_buttons controls). Under a 2 x 2 clock the stopwatch / pomodoro
        controls are on the lower pair, so this pair only holds the way back to the clock."""
        s = self.state
        if self.kind in ("watch", "pomo"):
            if tall:
                return [_clock("Clock", "clock", "off"), {}]
            return [_clock("Resume", "play", "resume"), _clock("End", "stop", "off")] if (self.kind == "pomo" and s == "pause") else self.controls()
        if s == "set":
            return [_clock("Start", "play", "start"), _clock("Clock", "clock", "off")]
        if s == "run":
            return [_clock("Pause", "pause", "pause"), _clock("End", "stop", "off")]
        if s == "pause":
            return [_clock("Resume", "play", "resume"), _clock("End", "stop", "off")]
        if s == "done":
            return [_clock("Dismiss", "x", "off", pulse=True), _clock("Again", "redo", "start", pulse=True)]
        return [_clock("24 hour" if eng.settings.get("clock_12h") else "12 hour", "clock", "hour"), _clock("Timer", "timer", "timer")]

    def lower_buttons(self):
        """The two buttons under the 2 x 2 clock: the other modes to start, or the controls of the one running."""
        if self.state == "off":
            return [_clock("Stopwatch", "stopwatch", "watch"), _clock("Pomodoro", "pomodoro", "pomo")]
        return self.controls() if self.kind in ("watch", "pomo") else []

    def _enter_phase(self, phase):
        self.phase, self.phase_at = phase, time.time()
        self.end, self.left = time.time() + PHASES[phase][0], float(PHASES[phase][0])

    def op(self, eng, op):
        if op == "pomo":
            self.kind, self.state, self.cycle = "pomo", "run", 0
            self._enter_phase("focus")
        elif op == "watch":
            self.kind, self.state, self.base, self.since, self.laps = "watch", "run", 0.0, time.time(), []
        elif op == "lap":
            self.laps.append(self.elapsed())
            sounds.play("lap", eng.settings)
            self._ripple("lap", 1.4)
        elif op == "reset":                    # zero the stopwatch; at zero already it goes back to the clock
            if self.base == 0 and self.state != "run":
                self.state, self.kind = "off", "timer"
            else:
                self.state, self.base, self.laps = "pause", 0.0, []
        elif op == "skip":
            self._advance(eng, chime=False)
        elif op in ("pause", "resume", "off") and self.kind != "timer":
            if op == "off":
                self.state, self.kind = "off", "timer"
            elif op == "pause":
                if self.kind == "watch":
                    self.base, self.state = self.elapsed(), "pause"
                else:
                    self.left, self.state = self.remaining(), "pause"
            else:
                if self.kind == "watch":
                    self.state, self.since = "run", time.time()
                else:
                    self.state, self.end = "run", time.time() + self.left
        elif op == "hour":
            from . import settings
            eng.settings["clock_12h"] = not eng.settings.get("clock_12h")
            settings.save(eng.settings)
            eng.broadcast({"type": "settings", "settings": eng.settings})
        elif op == "timer":
            self.kind, self.state, self.acc = "timer", "set", 0
        elif op == "start":
            self.state, self.end, self.left = "run", time.time() + self.set, float(self.set)
        elif op == "pause":
            self.left, self.state = self.remaining(), "pause"
        elif op == "resume":
            self.state, self.end = "run", time.time() + self.left
        elif op == "off":
            self.state = "off"
        eng._leds_for = None

    def turn(self, ticks):
        """The encoder over the clock while setting. Returns True when it used the turn."""
        if self.state != "set":
            return False
        self.acc += ticks
        steps = int(self.acc / TICKS_PER_STEP)
        if steps:
            self.acc -= steps * TICKS_PER_STEP
            for _ in range(abs(steps)):
                up = steps > 0
                step = 60 if (self.set < 600 or (not up and self.set <= 600)) else 300
                self.set = max(MIN, min(MAX, self.set + (step if up else -step)))
        return True

    def _advance(self, eng, chime=True):
        """Pomodoro: the next phase starts on its own."""
        if self.phase == "focus":
            self.cycle += 1
            self._enter_phase("long" if self.cycle % 4 == 0 else "break")
        else:
            self._enter_phase("focus")
        if self.state == "pause":
            self.state = "run"
        eng._leds_for = None
        if chime:
            sounds.play({"focus": "pomo_focus", "break": "pomo_break", "long": "pomo_long"}[self.phase], eng.settings)
            self._ripple(self.phase, 5.0)

    def _ripple(self, kind, secs):
        self.pad_kind, self.pad_at, self.pad_until = kind, time.time(), time.time() + secs

    def paint_pads(self, eng):
        """The pads ripple while an alert is fresh (the timer's stays until it is dismissed); handed back to the profile when it ends."""
        now = time.time()
        kind = "timer" if (self.kind == "timer" and self.state == "done") else self.pad_kind if now < self.pad_until else ""
        if kind:
            inner, outer = RIPPLE[kind]
            if eng.push.connected:
                pads.ripple(eng.push, now - (self.pad_at if kind != "timer" else self.pad_at or now), inner, outer, 0.9 if kind == "lap" else 1.3)
        elif self.rippling:
            eng._leds_for = None
        self.rippling = bool(kind)

    def tick(self, eng):
        if self.kind == "pomo":
            if self.state == "run" and time.time() >= self.end:
                self._advance(eng)
            return
        if self.kind == "watch":
            return
        if self.state == "run" and time.time() >= self.end:
            self.state, self.left = "done", 0.0
            eng._leds_for = None
            sounds.play("timer", eng.settings)
            self.pad_at = time.time()

    def face(self):
        """What the 2 x 1 clock draws while the timer is not off."""
        if self.kind == "watch":
            e = self.elapsed()
            h, rest = divmod(int(e), 3600)
            m, sec = divmod(rest, 60)
            text = f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}.{int(e * 10) % 10}"
            lap = ""
            if self.laps:
                d = self.laps[-1] - (self.laps[-2] if len(self.laps) > 1 else 0)
                lap = f"Lap {len(self.laps)}  {int(d // 60)}:{d % 60:04.1f}"
            label = lap or ("Running" if self.state == "run" else "Stopped" if e else "Ready")
            return {"state": self.state, "kind": "STOPWATCH", "text": text, "label": label, "frac": (e % 60) / 60 if e else 0.0, "tenths": self.state == "run"}
        r = self.remaining()
        secs = int(math.ceil(r)) if self.state == "run" else int(round(r))
        h, rest = divmod(secs, 3600)
        m, sec = divmod(rest, 60)
        text = f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"
        if self.kind == "pomo":
            total, name, color = PHASES[self.phase]
            return {"state": self.state, "kind": "POMODORO", "text": text, "label": name + (" · paused" if self.state == "pause" else ""),
                    "frac": r / total, "color": color, "dots": self.cycle % 4 + (4 if self.cycle and self.cycle % 4 == 0 and self.phase == "long" else 0),
                    "phase": self.phase}
        label = {"set": "Set time", "run": "Running", "pause": "Paused", "done": "Time's up"}[self.state]
        return {"state": self.state, "kind": "TIMER", "text": text, "label": label, "frac": 1.0 if self.state == "set" else (r / self.set if self.set else 0.0)}

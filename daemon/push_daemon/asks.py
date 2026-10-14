"""Alerts for Claude's questions: the Push tells you when Claude is waiting on a question card, and its button opens the Claude app.

When the session the Claude widget follows has a question card with no answer yet, the widget shows QUESTION. If you are in another app, the
alert takes the whole display ("Question for you", Dismiss / Open Claude) while the pads ripple and a chime plays up to three times, 20 seconds
apart. Open Claude brings the Claude app forward; Dismiss (or going to the Claude app yourself) ends the alert for that question. The question
itself is answered in the Claude app, never on the Push."""
import subprocess
import time

from . import claude_sessions, pads, sounds

CLAUDE_APP = "com.anthropic.claudefordesktop"
AMBER, BLUE = (255, 176, 64), (120, 180, 255)


class Asks:
    def __init__(self, eng):
        self.eng = eng
        self.dismissed = set()        # question ids you dismissed on the Push: no banner, pads or chime for them
        self.silenced = set()         # question ids already handled: no more pads or chime for them
        self.alerting = False
        self.alert_id = None
        self.alert_at = 0.0
        self.next_sound = 0.0
        self.chimes = 0

    # ---------- what is waiting ----------
    def current(self):
        """(session id, question card) waiting in the session the Claude widget follows, else (None, None)."""
        try:
            snap = claude_sessions.snapshot(self.eng.settings.get("claude_follow", "busy"), self.eng.front)
        except Exception:  # noqa: BLE001
            return None, None
        sid = snap.get("sid")
        return sid, (claude_sessions.ASKS.get(sid) if sid else None)

    def waiting(self):
        """Is there a question to alert about? The Claude widget's button pulses while this is true."""
        _, a = self.current()
        return bool(a) and a["id"] not in self.dismissed and self.enabled() and not self.in_claude()

    def enabled(self):
        return bool((self.eng.settings.get("ask_alert") or {}).get("on", True))

    def in_claude(self):
        return self.eng.front == CLAUDE_APP

    def fullscreen(self):
        """Is a question waiting while you are somewhere else? Then the alert takes the whole display (in the Claude app it shrinks to the half banner)."""
        return self.waiting() and not self.in_claude()

    def dismiss(self):
        _, a = self.current()
        if a:
            self.dismissed.add(a["id"])
            self.silenced.add(a["id"])
        self.eng._leds_for = None

    def open_claude(self):
        """Bring the Claude app forward, and stop alerting about this question."""
        _, a = self.current()
        if a:
            self.silenced.add(a["id"])
        subprocess.Popen(["osascript", "-e", 'tell application "Claude" to activate'], stderr=subprocess.DEVNULL)
        self.eng._leds_for = None

    def open(self):
        """The Claude widget's button: open the Claude app when a question is waiting."""
        if self.current()[1]:
            self.open_claude()

    # ---------- the alert: pads and chime ----------
    def alert_tick(self):
        """Every frame: while a question waits that has not been handled yet, ripple the pads and chime now and every 20 s."""
        _, a = self.current()
        if a and self.in_claude():
            self.silenced.add(a["id"])                # you are in the Claude app: the alert is over for this question (chime, pads, banner)
            self.dismissed.add(a["id"])
        live = bool(a) and self.enabled() and a["id"] not in self.silenced
        now = time.time()
        if live:
            if a["id"] != self.alert_id:
                self.alert_id, self.alert_at, self.next_sound, self.chimes = a["id"], now, now, 0
            if now >= self.next_sound and self.chimes < 3:     # three chimes, 20 s apart, then quiet
                self.chimes += 1
                self.next_sound = now + 20
                sounds.play("question", self.eng.settings)
        elif self.alerting:
            self.eng._leds_for = None             # hand the pads back to the profile
        if not a:
            self.alert_id = None
        self.alerting = live

    def paint_pads(self):
        """Rings of blue and amber spread from the middle of the pads until the question is handled."""
        if self.alerting and self.eng.push.connected:
            pads.ripple(self.eng.push, time.time() - self.alert_at, BLUE, AMBER)

    # ---------- the device events during the full-screen alert ----------
    def handle(self, ev):
        """While the full-screen alert is up: Open Claude (lower 8) brings Claude forward, any other display button dismisses it. True when consumed."""
        cid = ev["control"]
        if self.fullscreen() and ev["kind"] == "press" and cid.startswith(("btn-upper-", "btn-lower-")):
            if cid == "btn-lower-8":
                self.open_claude()
            else:
                self.dismiss()
            return True
        return False

    # ---------- what the display shows ----------
    def alert_scene(self):
        """The whole-display alert (a question waits and you are in another app)."""
        _, a = self.current()
        qs = a["questions"]
        w = {"type": "ask_banner", "col": 0, "row": 0, "w": 8, "h": 2, "n": len(qs), "left": 0, "header": qs[0]["header"], "question": qs[0]["question"], "away": True}
        return {"accent": "#d97757", "zones": {}, "active": [], "no_zones": True, "toast": None, "widgets": [w]}

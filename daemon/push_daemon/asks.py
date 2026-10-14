"""Answering Claude's multiple-choice questions on the Push.

When the session the Claude widget follows is waiting on a question card (an AskUserQuestion call with no answer yet) the widget shows
QUESTION and its button turns into a pulsing Answer. Pressing it takes over the whole display: the question on top, up to four options
as tiles over the lower buttons, the upper buttons for Prev / Next / Page / Read / Clear / Close / Submit, an encoder to move the
highlight. Other opens a dictation box (Wispr Flow) whose text becomes the answer. Submit hands the answers to ask_keys, which types them
into the Claude window. If the card is answered somewhere else the takeover closes by itself."""
import asyncio
import math
import subprocess
import threading
import time

from . import actions, claude_sessions, pads, settings as settings_mod, sounds

ASK_ON_PUSH = False                           # answering on the Push is switched off: the Push only alerts, and its button opens the Claude app
CLAUDE_APP = "com.anthropic.claudefordesktop"
PAGE = 4
STEP = 7                                      # encoder ticks it takes to move one option (was 2: far too touchy)
AMBER, GREEN, RED, BLUE = (255, 176, 64), (110, 230, 130), (255, 110, 110), (120, 180, 255)
OTHER = {"label": "Other...", "description": "Dictate your own answer", "other": True}


SPANS = {1: [(0, 8)], 2: [(0, 4), (4, 4)], 3: [(0, 3), (3, 3), (6, 2)], 4: [(0, 2), (2, 2), (2 * 2, 2), (6, 2)]}   # n tiles -> (first lower button, how many) for each


def spans(n):
    return SPANS[max(1, min(4, n))]


class Asks:
    def __init__(self, eng):
        self.eng = eng
        self.on = False
        self.ask_id = None
        self.ask = None
        self.sid = None
        self.qi = 0
        self.hi = 0
        self.ans = {}                 # question index -> {"sel": [option indexes], "other": text}
        self.mode = "pick"            # pick | read | dictate | sent
        self.scroll = 0
        self.acc = 0
        self.heard = ""
        self.rec = False
        self.stopped = False
        self.dictating = None
        self.sent_until = 0.0
        self.sent_text = ("", "")
        self.hook = None              # a question handed over by the Claude Code hook: {"ask", "sid", "fut", "until"}
        self.dismissed = set()        # question ids you dismissed on the Push: no banner, pads or chime for them
        self.silenced = set()         # question ids already opened on the Push: no more pads or chime for them
        self.alerting = False
        self.alert_id = None
        self.alert_at = 0.0
        self.next_sound = 0.0
        self.chimes = 0

    # ---------- what is waiting ----------
    def current(self):
        """(session id, question card): the one the hook handed over, else the one waiting in the session the Claude widget follows, else (None, None)."""
        if self.hook:
            return self.hook["sid"], self.hook["ask"]
        try:
            snap = claude_sessions.snapshot(self.eng.settings.get("claude_follow", "busy"), self.eng.front)
        except Exception:  # noqa: BLE001
            return None, None
        sid = snap.get("sid")
        return sid, (claude_sessions.ASKS.get(sid) if sid else None)

    def waiting(self):
        """Is there a card to answer (and not yet taken over)? The widget's button pulses while this is true."""
        _, a = self.current()
        return bool(a) and a["id"] not in self.dismissed and self.enabled() and not self.on and not self.in_claude()

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
        _, a = self.current()
        if a:
            self.silenced.add(a["id"])
        subprocess.Popen(["osascript", "-e", 'tell application "Claude" to activate'], stderr=subprocess.DEVNULL)
        self.eng._leds_for = None

    # ---------- a question handed over by the Claude Code hook ----------
    async def hook_request(self, body):
        """POST /api/ask from tools/push_ask_hook.py. Holds the question until you answer on the Push (returns the answers), press Close or run out of time (returns fallback: the laptop card shows)."""
        eng = self.eng
        if not eng.push.connected or eng.asleep or eng.standby or self.hook:
            return {"status": "unavailable"}
        ask = claude_sessions._ask_of({"id": body.get("tool_use_id") or f"hook{time.time()}", "input": body.get("tool_input") or {}})
        if not ask:
            return {"status": "unavailable"}
        wait = float(body.get("wait") or 90)
        fut = asyncio.get_event_loop().create_future()
        self.hook = {"ask": ask, "sid": body.get("session_id") or "hook", "fut": fut, "until": time.time() + wait}
        eng._leds_for = None
        try:
            return await asyncio.wait_for(fut, wait)
        except asyncio.TimeoutError:
            return {"status": "fallback"}
        finally:
            self.hook = None
            if self.on and self.ask_id == ask["id"]:
                self.close(dismiss=False)
            eng._leds_for = None

    def countdown(self):
        return max(0, int(self.hook["until"] - time.time())) if self.hook else 0

    # ---------- the alert: pads and chime ----------
    def alert_tick(self):
        """Every frame: while a question waits that has not been opened yet, ripple the pads and chime now and every 20 s."""
        _, a = self.current()
        if a and self.in_claude():
            self.silenced.add(a["id"])                # you are in the Claude app: the alert is over for this question (chime, pads, banner)
            self.dismissed.add(a["id"])
        live = bool(a) and self.enabled() and not self.on and a["id"] not in self.silenced
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
        """Rings of blue and amber spread from the middle of the pads until the question is opened or answered."""
        if self.alerting and self.eng.push.connected:
            pads.ripple(self.eng.push, time.time() - self.alert_at, BLUE, AMBER)

    # ---------- open / close ----------
    def open(self):
        sid, a = self.current()
        if not a:
            return
        if not ASK_ON_PUSH:
            return self.open_claude()
        self.silenced.add(a["id"])
        self.on, self.sid, self.ask, self.ask_id = True, sid, a, a["id"]
        self.qi = self.hi = self.scroll = 0
        self.ans, self.mode, self.heard = {}, "pick", ""
        self.eng._leds_for = None

    def close(self, dismiss=True):
        if dismiss and self.hook and not self.hook["fut"].done():   # Close hands the question to the laptop's own card
            self.hook["fut"].set_result({"status": "fallback"})
        if self.dictating:
            self._stop_dictation(cancel=True)
        self.on = False
        self.mode = "pick"
        self.eng._leds_for = None

    def sync(self):
        """Called every frame: the takeover ends by itself when the card is gone (answered on the laptop) or the session moved on."""
        if not self.on:
            return
        if self.mode == "sent":
            if time.time() > self.sent_until:
                self.close(dismiss=False)
            return
        _, a = self.current()
        if not a or a["id"] != self.ask_id:
            self.close(dismiss=False)

    # ---------- the data of the current page ----------
    def q(self):
        return self.ask["questions"][self.qi]

    def opts(self):
        return list(self.q()["options"]) + [OTHER]

    def pages(self):
        return max(1, math.ceil(len(self.opts()) / PAGE))

    def page_tiles(self):
        page = min(self.hi // PAGE, self.pages() - 1)
        return page, self.opts()[page * PAGE:(page + 1) * PAGE]

    def picked(self, qi=None):
        return self.ans.get(self.qi if qi is None else qi, {"sel": [], "other": ""})

    def answered(self, qi):
        a = self.ans.get(qi)
        return bool(a and a["sel"])

    def all_answered(self):
        return all(self.answered(i) for i in range(len(self.ask["questions"])))

    # ---------- events ----------
    def handle(self, ev):
        """Take the device events while the card is up. Returns True when consumed."""
        cid, kind = ev["control"], ev["kind"]
        if not self.on:
            if self.fullscreen() and kind == "press" and cid.startswith(("btn-upper-", "btn-lower-")):
                if cid == "btn-lower-8":
                    self.open_claude()                # the Open Claude pill: bring Claude forward
                else:
                    self.dismiss()                    # Dismiss (lower 7), or any other button
                return True
            return False
        if self.mode == "sent":
            return True
        if self.mode == "dictate":
            if kind == "press" and cid == "btn-upper-6" and self.rec:
                self.rec, self.stopped = False, True   # one Fn press stops Wispr Flow, which pastes the text into the box
                threading.Thread(target=actions.keys, args=("fn",), daemon=True).start()
            elif kind == "press" and cid == "btn-upper-8" and self.stopped:
                self._stop_dictation(cancel=False)
            elif kind == "press" and cid == "btn-upper-7":
                self._stop_dictation(cancel=True)
            return True
        if cid.startswith("knob-") and cid[5:].isdigit():
            if cid != "knob-1":
                return True                       # one encoder cycles the options (the button under it expands)
            if kind == "turn":
                if self.eng.knob_is_live(cid) and 0 < abs(ev["value"]) <= 20:
                    self.acc += ev["value"]
                    steps = int(self.acc / STEP)
                    if steps:
                        self.acc = 0                      # one move per turn, however fast it was spun
                        if self.mode == "read":
                            self.scroll = max(0, self.scroll + steps)
                        else:
                            self.hi = max(0, min(len(self.opts()) - 1, self.hi + (1 if steps > 0 else -1)))
            return True
        if kind != "press":
            return cid.startswith(("btn-upper-", "btn-lower-", "arrow-"))
        if cid.startswith("btn-lower-") and self.mode == "pick":
            page, tiles = self.page_tiles()
            b = int(cid.split("-")[-1]) - 1
            for j, (st, ln) in enumerate(spans(len(tiles))):
                if st == b:                       # one button per option: the first under its tile
                    self.choose(page * PAGE + j)
        elif cid.startswith("btn-upper-"):
            self.upper(int(cid.split("-")[-1]))
        elif cid == "arrow-left":
            self.upper(2)
        elif cid == "arrow-right":
            self.upper(3)
        else:
            return False
        self.eng._leds_for = None
        return True

    def choose(self, idx):
        self.hi = idx
        opts = self.opts()
        if opts[idx].get("other"):               # Other is exclusive: nothing else stays picked
            self.ans[self.qi] = {"sel": [], "other": ""}
            self.start_dictation()
            return
        a = self.ans.setdefault(self.qi, {"sel": [], "other": ""})
        other = len(self.q()["options"])
        a["sel"] = [i for i in a["sel"] if i != other]
        a["other"] = ""
        if self.q()["multi"]:
            a["sel"] = [i for i in a["sel"] if i != idx] if idx in a["sel"] else sorted(a["sel"] + [idx])
        else:
            a["sel"] = [idx]
            if self.qi < len(self.ask["questions"]) - 1:   # a single choice moves straight on to the next question
                self.qi, self.hi = self.qi + 1, 0

    def upper(self, n):
        last = self.qi == len(self.ask["questions"]) - 1
        if self.mode == "read":
            if n == 1:
                self.mode, self.scroll = "pick", 0
            return
        if n == 1:
            self.mode, self.scroll = "read", 0
        elif n == 2 and self.qi > 0:
            self.qi, self.hi = self.qi - 1, 0
        elif n == 3 and not last:
            self.qi, self.hi = self.qi + 1, 0
        elif n == 4:
            self.ans.pop(self.qi, None)
        elif n == 7:
            self.close()
        elif n == 8 and last and self.all_answered():
            self.submit()

    # ---------- the Other answer, dictated ----------
    def start_dictation(self):
        self.mode, self.heard, self.rec, self.stopped = "dictate", "", False, False
        self.dictating = asyncio.ensure_future(self._dictate())

    async def _dictate(self):
        """A small native text box comes forward; Wispr Flow (Fn twice) types what you say into it; Done confirms it."""
        prompt = self.q()["question"].replace('"', "'")[:140]
        script = (f'tell application "System Events"\nactivate\ndisplay dialog "{prompt}" default answer "" with title "Push 2: speak your answer" '
                  f'buttons {{"Cancel", "OK"}} default button "OK" giving up after 300\nend tell')
        proc = await asyncio.create_subprocess_exec("osascript", "-e", script, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        await asyncio.sleep(0.9)
        for _ in range(2):                       # the Wispr Flow shortcut: Fn twice
            await asyncio.get_event_loop().run_in_executor(None, actions.keys, "fn")
            await asyncio.sleep(0.12)
        self.rec = True
        out, _ = await proc.communicate()
        text = ""
        for part in out.decode("utf-8", "ignore").strip().split(", "):
            if part.startswith("text returned:"):
                text = part[len("text returned:"):].strip()
        self.dictating = None
        self.mode = "pick"
        if text:
            a = self.ans.setdefault(self.qi, {"sel": [], "other": ""})
            idx = len(self.q()["options"])
            a["other"] = text
            a["sel"] = sorted(set(a["sel"] + [idx])) if self.q()["multi"] else [idx]
        self.eng._leds_for = None

    def _stop_dictation(self, cancel):
        """Done (press OK in the box) or Cancel (Escape)."""
        actions.keys("esc" if cancel else "return")

    # ---------- the answers go back to Claude ----------
    def submit(self):
        answers = {}
        for i, q in enumerate(self.ask["questions"]):
            a = self.ans.get(i, {"sel": [], "other": ""})
            n = len(q["options"])
            labels = [q["options"][j]["label"] for j in a["sel"] if j < n] + ([a["other"]] if n in a["sel"] and a["other"] else [])
            answers[q["question"]] = ", ".join(labels)
        if self.hook and not self.hook["fut"].done():
            self.hook["fut"].set_result({"status": "answered", "answers": answers})
            self.sent_text = ("Sent to Claude", "")
        else:                                                   # the laptop card is showing too: the answers go in as a chat message, which closes the card
            lines = "\n".join(f"- {q}: {a or '(no answer)'}" for q, a in answers.items())
            threading.Thread(target=self._type_answers, args=(f"My answers to your questions:\n{lines}",), daemon=True).start()
            self.sent_text = ("Sent to Claude", "Typed into the Claude prompt")
        self.mode, self.sent_until = "sent", time.time() + 2.0

    @staticmethod
    def _type_answers(text):
        subprocess.run(["osascript", "-e", 'tell application "Claude" to activate'], stderr=subprocess.DEVNULL)
        time.sleep(0.6)
        actions.type_text(text + "\n")

    # ---------- what the display and the lights show ----------
    def scene(self):
        if not self.on:
            return None
        e = {"type": "ask", "col": 0, "span": 8}
        n = len(self.ask["questions"])
        last = self.qi == n - 1
        if self.mode == "sent":
            btn = [{}] * 8
            return self._spec({**e, "mode": "sent", "text": self.sent_text[0], "sub": self.sent_text[1], "buttons": btn})
        if self.mode == "dictate":
            btn = [{}] * 5 + [{"label": "STOP", "color": AMBER} if self.rec else {}, {"label": "CANCEL", "color": RED}, {"label": "DONE", "color": GREEN} if self.stopped else {}]
            return self._spec({**e, "mode": "dictate", "text": "Listening" if self.rec else "Check the text" if self.stopped else "Starting...",
                               "sub": "Speak, then press STOP (one Fn) and the text appears in the box" if self.rec else "DONE accepts the text  ·  CANCEL discards", "buttons": btn})
        q, opts = self.q(), self.opts()
        page, tiles = self.page_tiles()
        a = self.picked()
        out = []
        for j, (t, (st, ln)) in enumerate(zip(tiles, spans(len(tiles)))):
            idx = page * PAGE + j
            is_other = bool(t.get("other"))
            out.append({"x0": st * 120, "x1": (st + ln) * 120, "label": t["label"], "desc": t.get("description", ""), "sel": idx in a["sel"], "hi": idx == self.hi, "other": is_other,
                        "text": a["other"] if is_other and idx in a["sel"] else ""})
        btn = [{"label": "EXPAND", "on": True, "color": AMBER}, ({"label": "< PREV", "on": True, "color": BLUE} if self.qi > 0 else {}), ({"label": "NEXT >", "on": True, "color": BLUE} if not last else {}),
               ({"label": "CLEAR", "on": True, "color": AMBER} if a["sel"] else {}), {}, {}, {"label": "CLOSE", "on": True, "color": RED},
               {"label": "SUBMIT", "on": True, "color": GREEN} if last and self.all_answered() else {}]
        hi = opts[self.hi]
        base = {**e, "mode": "pick", "dots": "".join("a" if self.answered(i) else "-" for i in range(n)), "qi": self.qi + 1, "qn": n, "header": q["header"], "question": q["question"], "multi": q["multi"], "page": page, "pages": self.pages(),
                "tiles": out, "buttons": btn}
        if self.mode == "read":
            body = a["other"] if hi.get("other") and a["other"] else hi.get("description", "")
            btn = [{"label": "BACK", "on": True, "color": AMBER}] + [{}] * 7
            return self._spec({**base, "mode": "read", "buttons": btn, "scroll": self.scroll, "read": {"label": hi["label"], "body": body or "(no more text)"}})
        return self._spec(base)

    def alert_scene(self):
        """The whole-display alert (a question waits and you are in another app)."""
        _, a = self.current()
        qs = a["questions"]
        w = {"type": "ask_banner", "col": 0, "row": 0, "w": 8, "h": 2, "n": len(qs), "left": 0, "header": qs[0]["header"], "question": qs[0]["question"], "away": True}
        return self._spec(w)

    def _spec(self, w):
        return {"accent": "#d97757", "zones": {}, "active": [], "no_zones": True, "toast": None, "widgets": [w]}

    def leds(self):
        """Only the buttons that do something are lit: the upper ones with a label that is on, and the first lower button under each option."""
        out = {}
        sc = self.scene()
        if not sc:
            return out
        w = sc["widgets"][0]
        for i, b in enumerate(w.get("buttons") or []):
            if b.get("label") and b.get("on", True):
                out[f"btn-upper-{i + 1}"] = tuple(b.get("color") or AMBER)
        if w.get("mode") == "pick":
            for t, (st, ln) in zip(w.get("tiles") or [], spans(len(w.get("tiles") or []))):
                out[f"btn-lower-{st + 1}"] = AMBER if t["sel"] else (255, 255, 255) if t["hi"] else (110, 116, 150)
        return out

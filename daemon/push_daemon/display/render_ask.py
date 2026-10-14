"""The full-screen question card (a mixin of render.Painter). Mirrors ui/src/display/ask.ts: change both together.

Claude asks a question with options; this takes over the whole 960 x 160 display. Top strip: the 8 upper buttons' labels. Then a line with
the question number, then the question. Under it the options as tiles, up to four, each over its share of the 8 lower buttons, so four
options leave no empty space and one option spans the whole width. Modes: pick, read (the full text of one option), dictate (the Other
answer is being spoken), sent."""
import math

from .render_claude import mixc

INK, INK2, INK3 = (238, 238, 246), (170, 176, 204), (120, 126, 156)
TILE = (22, 24, 34)
GOOD = (110, 230, 130)


def accent_of(spec):
    h = (spec.get("accent") or "#d97757").lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class AskMixin:
    def lines_n(self, text, size, maxw, n, role="label", bold=False):
        """Wrapped text, at most n lines; the last one ends in ... when there is more."""
        lines = self.wrap(text, size, maxw, role)
        if len(lines) <= n:
            return lines
        last = lines[n - 1]
        while len(last) > 1 and self.width(last + "...", size, role, bold) > maxw:
            last = last[:-1]
        return lines[:n - 1] + [last.rstrip() + "..."]

    def ask_strip(self, w, acc):
        """The labels of the 8 upper buttons, drawn like the rest of the display: plain mono text in a 24 px strip, a bar along the bottom edge of the ones that do something."""
        for i, b in enumerate(w.get("buttons") or []):
            if not b or not b.get("label") or b.get("on") is False:
                continue                                      # nothing to do here: nothing drawn
            c = b.get("color") or acc
            c = tuple(c) if isinstance(c, (list, tuple)) else acc
            x0 = i * 120 + 8
            self.text(i * 120 + 60, 13, b["label"], 11, INK, "mono", True, "mm")
            self.rrect(x0, 21.5, x0 + 104, 23, 0.75, fill=c)

    def w_ask(self, w):
        acc = accent_of(self.spec)
        mode = w.get("mode", "pick")
        self.ask_strip(w, acc)
        if mode == "dictate":
            return self.ask_dictate(w, acc)
        if mode == "sent":
            self.text(480, 84, w.get("text", "Sent to Claude"), 30, GOOD, "label", True, "mm")
            self.text(480, 116, w.get("sub", ""), 12, INK3, "mono", False, "mm")
            return
        if mode == "read":
            return self.ask_read(w, acc)
        # --- the question line ---
        head = f"Q {w['qi']}/{w['qn']}" + (f"  ·  {w['header'].upper()}" if w.get("header") else "")
        self.text(14, 38, head, 11, acc, "mono", True, "lm")
        # one dot per question: lit when answered, ringed when it is the one on screen
        dots = w.get("dots") or ""
        dx = 946
        for i in range(len(dots) - 1, -1, -1):
            cur = i + 1 == w["qi"]
            c = GOOD if dots[i] == "a" else INK3
            if dots[i] == "a":
                self.d.ellipse([(dx - 4) * 2, (38 - 4) * 2, (dx + 4) * 2, (38 + 4) * 2], fill=c)
            else:
                self.d.ellipse([(dx - 4) * 2, (38 - 4) * 2, (dx + 4) * 2, (38 + 4) * 2], outline=c, width=2)
            if cur:
                self.d.ellipse([(dx - 7) * 2, (38 - 7) * 2, (dx + 7) * 2, (38 + 7) * 2], outline=acc, width=2)
            dx -= 18
        right = ("PICK SEVERAL" if w.get("multi") else "PICK ONE") + (f"  ·  PAGE {w['page'] + 1}/{w['pages']}" if w.get("pages", 1) > 1 else "")
        self.text(dx - 4, 38, right, 11, INK3, "mono", True, "rm")
        qlines = self.wrap(w.get("question", ""), 15, 880, "label")
        if len(qlines) <= 2:
            qsize, qn, pitch, top = 15, 2, 19, 88
        else:                                       # a long question: smaller, three lines, the tiles shrink a little
            qsize, qn, pitch, top = 12.5, 3, 15, 98
        for i, ln in enumerate(self.lines_n(w.get("question", ""), qsize, 880, qn, "label", True)):
            self.text(14, 56 + i * pitch, ln, qsize, INK, "label", True, "lm")
        # --- the option tiles, each over its own lower buttons ---
        tiles = w.get("tiles") or []
        n = max(1, len(tiles))
        bot = 157
        for i, t in enumerate(tiles):
            x0, x1 = t["x0"] + 4, t["x1"] - 4
            sel, hi = t.get("sel"), t.get("hi")
            self.rrect(x0, top, x1, bot, 8, fill=mixc(TILE, acc, 0.24) if sel else TILE, outline=acc if sel else (200, 205, 230) if hi else None, width=2 if (sel or hi) else 1)
            # a small tab on the bottom edge, over the button that picks this option
            nx = x0 - 4 + 60
            self.rrect(nx - 14, bot - 1, nx + 14, bot + 2, 1.5, fill=acc if sel else (255, 255, 255) if hi else INK3)
            # the radio / checkbox
            mx, my = x0 + 15, top + 15
            if w.get("multi"):
                self.rrect(mx - 6, my - 6, mx + 6, my + 6, 3, fill=acc if sel else None, outline=acc if sel else INK3, width=1.4)
                if sel:
                    self.d.line([((mx - 3) * 2, my * 2), ((mx - 1) * 2, (my + 2.5) * 2), ((mx + 3.5) * 2, (my - 3) * 2)], fill=(16, 16, 24), width=3, joint="curve")
            else:
                self.d.ellipse([(mx - 6) * 2, (my - 6) * 2, (mx + 6) * 2, (my + 6) * 2], outline=acc if sel else INK3, width=3, fill=None)
                if sel:
                    self.d.ellipse([(mx - 3) * 2, (my - 3) * 2, (mx + 3) * 2, (my + 3) * 2], fill=acc)
            tx, mw = x0 + 30, x1 - x0 - 38
            lab_lines = self.lines_n(t.get("label", ""), 13, mw, 2 if (x1 - x0) < 600 else 1, "label", True)
            for j, ln in enumerate(lab_lines):
                self.text(tx, top + 15 + j * 15, ln, 13, INK if not t.get("other") else acc, "label", True, "lm")
            dy = top + 15 + len(lab_lines) * 15 + 3
            room = int((bot - 5 - dy) // 12)
            body = t.get("text") or t.get("desc") or ""
            for j, ln in enumerate(self.lines_n(body, 10.5, x1 - x0 - 18, max(1, room), "mono")):
                self.text(x0 + 10, dy + j * 12 + 2, ln, 10.5, INK2 if sel else INK3, "mono", False, "lm")
        if w.get("note"):
            self.text(480, 8, w["note"], 10, INK3, "mono", False, "mm")

    def ask_read(self, w, acc):
        """Everything: the whole question, then the highlighted option in full; the encoder scrolls."""
        r = w.get("read") or {}
        self.text(14, 38, "EXPANDED  ·  turn the encoder to scroll", 11, acc, "mono", True, "lm")
        rows = [(ln, 12.5, INK3, False, "label", 15) for ln in self.wrap(w.get("question", ""), 12.5, 920, "label")]
        rows.append(("", 6, INK, False, "label", 8))
        rows += [(ln, 15, INK, True, "label", 19) for ln in self.wrap(r.get("label", ""), 15, 920, "label")]
        rows += [(ln, 12, INK2, False, "mono", 15) for ln in self.wrap(r.get("body", ""), 12, 920, "mono")]
        top = max(0, min(int(w.get("scroll") or 0), max(0, len(rows) - 1)))
        y, shown = 58, 0
        for i in range(top, len(rows)):
            ln, size, color, bold, role, pitch = rows[i]
            if y + pitch / 2 > 158:
                break
            if ln:
                self.text(14, y, ln, size, color, role, bold, "lm")
            y += pitch
            shown = i
        if top > 0:
            self.text(948, 50, "^", 11, INK2, "mono", True, "mm")
        if shown < len(rows) - 1:
            self.text(948, 150, "v", 11, INK2, "mono", True, "mm")

    def ask_dictate(self, w, acc):
        pulse = 0.5 + 0.5 * math.sin(self.t * 5)
        c = mixc((60, 20, 20), (255, 90, 90), 0.4 + 0.6 * pulse)
        self.d.ellipse([(60 - 14) * 2, (84 - 14) * 2, (60 + 14) * 2, (84 + 14) * 2], fill=c)
        self.text(100, 76, w.get("text", "Listening"), 28, INK, "label", True, "lm")
        self.text(100, 104, w.get("sub", ""), 12, INK3, "mono", False, "lm")
        if w.get("heard"):
            for i, ln in enumerate(self.lines_n(w["heard"], 13, 900, 2, "label", False)):
                self.text(100, 128 + i * 16, ln, 13, acc, "label", False, "lm")

    QMARK = ["01110", "10001", "00001", "00110", "00100", "00000", "00100"]    # the pixel question mark
    PAL = [(255, 200, 60), (255, 110, 160), (110, 230, 130), (106, 167, 255), (255, 140, 90)]
    ORANGE, GOLD = (255, 122, 64), (255, 200, 60)

    def ask_pill(self, w, x1, y1, pulse):
        """Away from Claude: a solid Open Claude pill; inside Claude: a quiet hint."""
        if w.get("away"):                                  # two pills over the last two lower buttons: Dismiss, Open Claude
            by0, by1 = y1 - 38, y1 - 4
            self.rrect(x1 - 232, by0, x1 - 128, by1, 17, outline=INK3, width=2)
            self.text(x1 - 180, (by0 + by1) / 2, "Dismiss", 15, INK2, "label", True, "mm")
            self.rrect(x1 - 112, by0, x1 - 8, by1, 17, fill=mixc(self.ORANGE, (255, 175, 120), pulse * 0.5))
            self.text(x1 - 60, (by0 + by1) / 2, "Open Claude", 14, (36, 14, 4), "label", True, "mm")
        else:
            self.text(x1 - 28, y1 - 22, "Answer it in the Claude app", 11, INK3, "mono", False, "rm")

    def w_ask_banner(self, w):
        """The 'Claude is asking' alert: over the whole display when you are in another app (w.away), else over the half the Claude widget had.
        A giant pixel ? in bands of colour that roll, confetti falling, the question beside it. Mirrors drawAskBanner in ui/src/display/ask.ts."""
        x0, _, x1, _ = self.rect(w)
        y0, y1 = 10, 150
        wide = bool(w.get("away"))
        pulse = 0.5 + 0.5 * math.sin(self.t * 4)
        k = 11
        shift = int(self.t * 4)
        for j, row in enumerate(self.QMARK):
            self.pixels([row], x0 + 36, y0 + 18 + j * k, k, {"1": self.PAL[(j + shift) % 5]})
        self.confetti(x0 + 120, y0, x1 - 8, y1, (self.t * 0.9) % 3)
        tx = x0 + 130
        self.text(tx, y0 + 20, "Question for you", 24 if wide else 20, self.GOLD, "label", True, "lm")
        size, pitch = (19, 24) if wide else (14, 18)
        for i, ln in enumerate(self.lines_n(w.get("question", ""), size, x1 - tx - 28, 3, "label", True)):
            self.text(tx, y0 + 52 + i * pitch, ln, size, INK, "label", True, "lm")
        if wide:
            self.text(tx, y1 - 14, f"from Claude  ·  {int(w.get('n') or 1)} to answer", 11, INK3, "mono", True, "lm")
        self.ask_pill(w, x1, y1, pulse)

    def w_limit(self, w):
        """A usage window has crossed a threshold: the whole display, in the error colour."""
        red, dark = (255, 77, 77), (60, 8, 12)
        blink = int(w.get("level_blink") or 0)
        self.rrect(4, 6, 956, 154, 14, fill=dark, outline=mixc(dark, red, 0.55 + 0.45 * blink), width=3)
        self.text(36, 40, f"{w.get('name', 'CLAUDE')}  ·  {w.get('window', '')} LIMIT", 20, red, "label", True, "lm")
        self.text(36, 74, "Almost out: slow down or switch tasks" if int(w.get("pct", 0)) < 95 else "About to hit the limit", 14, INK2, "label", False, "lm")
        self.text(924, 62, f"{int(w.get('pct', 0))}%", 64, (255, 255, 255), "label", True, "rm")
        pct = max(0, min(100, int(w.get("pct", 0))))
        self.rrect(36, 112, 924, 130, 9, fill=(30, 6, 8))
        self.rrect(36, 112, 36 + (924 - 36) * pct / 100, 130, 9, fill=red)
        if w.get("resets"):
            self.text(36, 144, f"RESETS IN {w['resets'].upper()}", 11, INK3, "mono", True, "lm")
        self.text(924, 144, "PRESS ANY BUTTON TO DISMISS", 10, INK3, "mono", False, "rm")

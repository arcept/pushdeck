"""The Claude question alert and the usage-limit alert (a mixin of render.Painter). Mirrors ui/src/display/ask.ts: change both together.

The question alert is a giant pixel ? with confetti and the question beside it, over the whole display (when you are in another app, with
Dismiss / Open Claude pills) or over the half the Claude widget had. Questions are answered in the Claude app, never on the Push."""
import math

from .render_claude import mixc

INK, INK2, INK3 = (238, 238, 246), (170, 176, 204), (120, 126, 156)


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

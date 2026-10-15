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
            self.rrect(x1 - 232, by0, x1 - 128, by1, 17, fill=(46, 46, 56))
            self.text(x1 - 180, (by0 + by1) / 2, "Dismiss", 15, INK, "label", True, "mm")
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

    def limit_icon(self, name, cx, cy, ink, col):
        """The two limits' icons, solid shapes inside the badge: a clock face for the 5-hour session, a calendar for the week. Mirrors limitIcon in ui/src/display/ask.ts."""
        from .render import S as k   # (imported here: render.py imports this module)
        d = self.d
        if name == "calendar":
            self.rrect(cx - 24, cy - 20, cx + 24, cy + 24, 7, fill=ink)
            self.rrect(cx - 24, cy - 20, cx + 24, cy - 8, 7, fill=mixc(ink, col, 0.5))
            for x in (cx - 11, cx + 11):
                d.line([(x * k, (cy - 27) * k), (x * k, (cy - 14) * k)], fill=ink, width=int(5 * k))
            for r in range(2):
                for c in range(3):
                    x, y = cx - 13 + c * 13, cy + 2 + r * 12
                    self.rrect(x - 3, y - 3, x + 3, y + 3, 1.5, fill=col)
        else:
            d.ellipse([((cx - 26) * k, (cy - 26) * k), ((cx + 26) * k, (cy + 26) * k)], fill=ink)
            d.line([(cx * k, (cy - 15) * k), (cx * k, cy * k), ((cx + 12) * k, (cy + 8) * k)], fill=col, width=int(4 * k), joint="curve")

    def w_limit(self, w):
        """A usage window climbed past a level: the whole display, on the plain black. The colour (set by the daemon) runs from the limit's own towards red
        as usage rises; the badge and the big label say which limit it is. No outlines, no tinted background. Mirrors drawLimit in ui/src/display/ask.ts."""
        col = tuple(int(v) for v in (w.get("color") or (255, 77, 77)))
        pct = max(0, min(100, int(w.get("pct", 0))))
        self.rrect(28, 26, 112, 110, 18, fill=col)
        self.limit_icon(w.get("icon"), 70, 68, mixc((12, 8, 8), col, 0.12), col)
        self.text(134, 38, f"{w.get('name', 'Claude')}  ·  Usage Alert", 12, INK3, "mono", True, "lm")
        self.text(134, 70, f"{w.get('window', '')} Limit", 36, col, "label", True, "lm")
        self.text(134, 100, w.get("msg", ""), 15, INK2, "label", False, "lm")
        self.text(932, 66, f"{pct}%", 76, (255, 255, 255), "label", True, "rm")
        x0, x1, y0, y1 = 28, 932, 118, 132
        self.rrect(x0, y0, x1, y1, 7, fill=(34, 34, 40))
        self.rrect(x0, y0, x0 + (x1 - x0) * pct / 100, y1, 7, fill=col)
        for mark in (70, 80, 90):                                         # the levels, as notches in the bar
            x = x0 + (x1 - x0) * mark / 100
            self.rrect(x - 1, y0, x + 1, y1, 0, fill=(0, 0, 0))
        if w.get("resets"):
            self.text(28, 145, f"Resets in {w['resets']}", 11, INK3, "mono", True, "lm")
        self.text(932, 145, f"Press Any Button  ·  Closes in {int(w.get('closes') or 0)}s", 10, INK3, "mono", False, "rm")

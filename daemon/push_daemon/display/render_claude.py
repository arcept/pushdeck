"""The Claude session widget's drawing (a mixin of render.Painter). Mirrors ui/src/display/claude.ts: change both together.

Layout (display px, widget box x0..x1 x y0..y1): an app chip + chat title and a state pill on top, the current action and task count under it, then a
thick animated progress bar with the mascot standing on it, walking with the progress. Bars: neon / plasma (new) and classic;
mascots: pip / pixel (pre-drawn sprite sheets from tools/make_sprites.py) and classic (the original pixel critter)."""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ASSETS = Path(__file__).parent / "assets"
META = json.loads((ASSETS / "mascots.json").read_text())
KROW = {k: i for i, k in enumerate(META["kinds"])}
U, PX, NF = META["units"], META["px"], META["frames"]
_sheets, _scaled, _caps, _smooth = {}, {}, {}, {}

NEON = [((60, 230, 255), (40, 140, 255)), ((90, 170, 255), (110, 90, 255)), ((150, 110, 255), (210, 70, 255)),
        ((230, 80, 230), (255, 70, 150)), ((255, 100, 110), (255, 150, 60)), ((255, 190, 60), (255, 225, 110))]
FLOW = [(70, 120, 255), (170, 80, 255), (255, 80, 170), (255, 170, 60), (70, 220, 255), (70, 120, 255)]   # plasma, cyclic
KIND_OF = {"read": "reader", "edit": "builder", "run": "runner", "plan": "planner", "agent": "planner", "think": "thinker"}
OLD_ACT = {"reader": "read", "builder": "edit", "runner": "run", "planner": "plan", "thinker": "think", "done": "cheer", "timer": "hourglass"}
STATE_COL = {"ask": (120, 180, 255), "working": (255, 176, 64), "idle": (150, 158, 190), "done": (110, 230, 130), "none": (90, 92, 110)}


def mixc(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def lerp_stops(stops, u):
    u = max(0.0, min(1.0, u)) * (len(stops) - 1)
    j = min(int(u), len(stops) - 2)
    return mixc(stops[j], stops[j + 1], u - j)


def smooth(key, target, t, rate=7.0):
    """Eases a value toward its target (state kept between frames) so heads and counters glide instead of jumping."""
    v, last = _smooth.get(key, (target, t))
    dt = max(0.0, min(0.2, t - last))
    v = target if abs(target - v) < 0.02 else v + (target - v) * (1 - math.exp(-dt * rate))
    _smooth[key] = (v, t)
    return v


def tomatoize(im):
    """The mascot as a tomato: its orange turns tomato red and a green leaf crowns its head. Mirrors tomatoize() in ui/src/display/claude.ts."""
    a = np.array(im, dtype=np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    m = (r > 150) & (r - b > 60) & (g > b) & (g < r * 0.8) & (al > 0)
    a[..., 1] = np.where(m, g * 0.42, g)
    a[..., 2] = np.where(m, b * 0.45, b)
    out = Image.fromarray(a.astype(np.uint8), "RGBA")
    ys, xs = np.where(al > 20)
    if len(xs):
        cx, top, wd = (xs.min() + xs.max()) / 2, ys.min(), xs.max() - xs.min()
        lw, lh = wd * 0.34, wd * 0.16
        d, green = ImageDraw.Draw(out), (63, 155, 74, 255)
        for dx, dy in ((-1.0, -0.35), (1.0, -0.35), (-0.5, 0.2), (0.5, 0.2)):
            d.polygon([(cx, top + lh * 0.6), (cx + dx * lw, top + lh * 0.6 + dy * lh), (cx + dx * lw * 0.45, top + lh * 1.3)], fill=green)
    return out


class ClaudeMixin:
    # ---------- sprites ----------
    def _sprite(self, look, kind, frame, size, tomato=False):
        key = (look, kind, frame, size, tomato)
        hit = _scaled.get(key)
        if hit:
            return hit
        sh = _sheets.get(look)
        if sh is None:
            sh = _sheets[look] = Image.open(ASSETS / f"mascot_{look}.png").convert("RGBA")
        cell = round(U * META["scale"][look])
        c = sh.crop((frame * cell, KROW[kind] * cell, (frame + 1) * cell, (KROW[kind] + 1) * cell))
        if tomato:
            c = tomatoize(c)
        c = c.resize((size, size), Image.NEAREST if look == "pixel" else Image.LANCZOS)
        out = _scaled[key] = (c.convert("RGB"), c.getchannel("A"))
        return out

    def mascot(self, look, kind, cx, foot, k, tt, jump=0.0, phase=0.0, moving=True, rate=11, body=(217, 119, 87), tomato=False):
        """One mascot standing with its feet on `foot` (display px), body centre at cx, k display px per sprite unit."""
        if look not in ("pip", "pixel", "classic"):
            look = "pip"
        if tomato:
            body = (229, 72, 59)
        if look == "classic":
            kk = 3 if k >= 0.8 else 2 if k >= 0.55 else 1
            self.critter(cx - 6 * kk, foot, kk, body, OLD_ACT.get(kind, ""), phase, sleep=kind == "sleep", jump=jump, slow=not moving or rate < 8)
            return
        if kind == "sleep":
            f = int(tt * 5 + phase) % NF
        else:
            f = int(tt * rate + phase * 8) % 8 if moving else 0
            if (tt + phase) % 3.7 < 0.16:
                f = 8 if f < 4 else 9
        if look == "pixel":   # whole display pixels per sprite pixel, a little larger than the others, snapped to the pixel grid
            sp = META["scale"]["pixel"]
            n = max(1, int(k * 1.25 / sp))
            ku = sp * n
            rgb, a = self._sprite(look, kind, f, round(U * sp) * n * 2, tomato)
            self.img.paste(rgb, (round(cx - META["cx"] * ku) * 2, round(foot - jump - META["foot"] * ku) * 2), a)
            return
        size = max(2, round(U * k * 2))
        rgb, a = self._sprite(look, kind, f, size, tomato)
        self.img.paste(rgb, (round((cx - META["cx"] * k) * 2), round((foot - jump - META["foot"] * k) * 2)), a)

    def buddy(self, look, kind, xl, foot, kold, jump=0.0, body=(217, 119, 87), moving=True, tomato=False):
        """The small mascot of the usage and clock widgets (old-style left edge and size: 1 or 2)."""
        self.mascot(look, kind, xl + 6 * kold, foot, 0.55 if kold == 1 else 0.8, self.t, jump=jump, moving=moving, rate=6, body=body, tomato=tomato)

    # ---------- bar parts ----------
    def _cap(self, w, h, c0, c1, glow=0.0):
        """A capsule with a vertical gradient and a gloss, plus its glow, cached; returns (rgb, alpha, margin)."""
        S = 2
        wp, hp = max(2, round(w * S)), max(2, round(h * S))
        key = ("cap", wp, hp, c0, c1, round(glow, 1))
        hit = _caps.get(key)
        if hit:
            return hit
        m = int(glow * 9 * S) if glow else 0
        W_, H_ = wp + 2 * m, hp + 2 * m
        mask = Image.new("L", (W_, H_), 0)
        ImageDraw.Draw(mask).rounded_rectangle([m, m, m + wp - 1, m + hp - 1], radius=hp / 2, fill=255)
        ys = np.clip((np.arange(H_)[:, None] - m) / max(1, hp), 0, 1)
        arr = np.array(c0, float)[None, None, :] + (np.array(c1, float) - np.array(c0, float))[None, None, :] * ys[:, :, None]
        arr = np.broadcast_to(arr, (H_, W_, 3)).copy()
        gl = np.zeros((H_, W_), float)
        gl[m + int(hp * 0.12):m + int(hp * 0.46), :] = 1.0                         # the gloss band
        gmask = Image.new("L", (W_, H_), 0)
        if wp > hp * 0.9:
            ImageDraw.Draw(gmask).rounded_rectangle([m + hp * 0.3, m + hp * 0.14, m + wp - hp * 0.3, m + hp * 0.44], radius=hp * 0.17, fill=255)
        else:
            ImageDraw.Draw(gmask).rectangle([m + wp * 0.2, m + hp * 0.12, m + wp * 0.45, m + hp * 0.7], fill=255)
        g = np.asarray(gmask, float)[:, :, None] / 255 * 0.36
        arr = arr * (1 - g) + 255 * g
        rgb = Image.fromarray(arr.astype(np.uint8))
        alpha = mask
        if glow:
            gm = mask.filter(ImageFilter.GaussianBlur(m / 2.2)).point(lambda v: int(min(255, v * glow * 1.2)))
            col = Image.new("RGB", (W_, H_), c1)
            col.paste(rgb, (0, 0), mask)
            rgb, alpha = col, ImageChops_lighter(mask, gm)
        out = _caps[key] = (rgb, alpha, m)
        return out

    def cap(self, x0, y0, x1, y1, c0, c1, glow=0.0):
        if x1 - x0 < 1:
            return
        rgb, a, m = self._cap(x1 - x0, y1 - y0, c0, c1, glow)
        self.img.paste(rgb, (round(x0 * 2) - m, round(y0 * 2) - m), a)

    def flat(self, x0, y0, x1, y1, color):
        """A hard-edged rectangle on whole display pixels (the pixel look has no rounding)."""
        a, b, c, d = round(x0), round(y0), round(x1), round(y1)
        if c > a and d > b:
            self.d.rectangle([a * 2, b * 2, c * 2 - 1, d * 2 - 1], fill=color)

    def tint(self, x0, y0, x1, y1, color, alpha, r=2):
        """A translucent rounded rectangle over what is there."""
        S = 2
        w, h = max(1, round((x1 - x0) * S)), max(1, round((y1 - y0) * S))
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=r * S, fill=int(255 * alpha))
        self.img.paste(Image.new("RGB", (w, h), color), (round(x0 * S), round(y0 * S)), mask)

    def orb(self, cx, cy, r, color, strength=1.0):
        """A glowing dot (bar heads, sparks)."""
        key = ("orb", round(r * 2), color, round(strength, 1))
        hit = _caps.get(key)
        if not hit:
            S, m = 2, int(r * 2.6 * 2)
            n = 2 * m
            yy, xx = np.mgrid[0:n, 0:n]
            d = np.hypot(xx - m, yy - m) / (r * S)
            a = np.clip(1.15 - d, 0, 1) ** 1.6 * 0.85 * strength + np.clip(1.5 - d * 0.5, 0, 1) ** 3 * 0.3 * strength
            core = np.clip(1.25 - d * 1.5, 0, 1)
            col = np.array(color, float)[None, None, :] * (1 - core[:, :, None]) + 255 * core[:, :, None]
            hit = _caps[key] = (Image.fromarray(col.astype(np.uint8)), Image.fromarray((np.clip(a + core, 0, 1) * 255).astype(np.uint8)), m)
        rgb, a, m = hit
        self.img.paste(rgb, (round(cx * 2) - m, round(cy * 2) - m), a)

    # ---------- icons and pills ----------
    def glyph(self, x, cy, act, tt, col, n=12):
        """A small flat animated icon for what it is doing right now (think, read, edit, run, plan, agent, compact); x is its left edge, cy its centre line."""
        y = cy - n / 2
        dim = mixc((0, 0, 0), col, 0.35)
        R = lambda a, b, c, d, f: self.rrect(x + a, y + b, x + c, y + d, 0, f)
        if act == "compact":                       # two blocks squeeze a middle one
            g = (math.sin(tt * 4.5) + 1) / 2
            R(0, 1, 3, n - 1, col); R(n - 3, 1, n, n - 1, col)
            R(3 + g * 2, 3, n - 3 - g * 2, n - 3, dim)
        elif act == "read":                        # a page with a scan line
            R(1, 0, n - 1, n, dim); R(2, 1, n - 2, n - 1, (12, 12, 18))
            sy = 2 + int(((tt * 1.6) % 1) * (n - 5)); R(2, sy, n - 2, sy + 2, col)
        elif act == "edit":                        # lines being typed
            for i in range(3):
                w = max(0, min(n - 2, int(((tt * 0.9 - i * 0.3) % 1.6) / 1.2 * (n - 2))))
                R(1, 1 + i * 4, 1 + w, 3 + i * 4, col)
        elif act == "run":                         # prompt and blinking cursor
            for i in range(3):
                R(1 + i, 2 + i, 3 + i, 4 + i, col); R(1 + i, 8 - i, 3 + i, 10 - i, col)
            if int(tt * 2.5) % 2 == 0:
                R(6, 9, 11, 11, col)
        elif act == "plan":                        # checklist ticking off
            k = int(tt * 1.6) % 4
            for i in range(3):
                R(0, 1 + i * 4, 3, 4 + i * 4, col if k > i else dim); R(5, 2 + i * 4, n, 3 + i * 4, dim)
        elif act == "agent":                       # two helpers orbiting
            for j in range(2):
                a = tt * 5 + j * math.pi
                px, py = n / 2 + math.cos(a) * 4, n / 2 + math.sin(a) * 4
                R(px - 1.5, py - 1.5, px + 1.5, py + 1.5, col)
        else:                                      # three dots, one lit and lifted in turn
            k = int(tt * 5) % 4
            for i in range(3):
                up = 2 if k == i else 0
                R(i * 4, 6 - up, i * 4 + 3, 9 - up, col if k == i else dim)

    def chip(self, x, y, size, app, host, mode="code"):
        """What kind of session this is, in a tile: </> for Claude Code, a speech bubble for chat / cowork, the VS Code mark in VS Code, >_ in a terminal; a small badge tells where it runs (local laptop / cloud)."""
        col = {"desktop": (217, 119, 87), "code": (59, 156, 255), "terminal": (98, 224, 160)}.get(app, (150, 158, 190))
        self.rrect(x, y, x + size, y + size, size * 0.3, fill=mixc((16, 16, 24), col, 0.16), outline=mixc((16, 16, 24), col, 0.55), width=1)
        cx, cy, u = x + size / 2, y + size / 2, size / 24
        P = lambda *pts: [(px * 2, py * 2) for px, py in pts]
        if app == "code":                                         # the VS Code mark: a tall ribbon with a < cut into it
            self.d.polygon(P((cx + 1.5 * u, cy - 8 * u), (cx + 8 * u, cy - 5 * u), (cx + 8 * u, cy + 5 * u), (cx + 1.5 * u, cy + 8 * u)), fill=col)
            self.d.line(P((cx - 2 * u, cy - 5.5 * u), (cx - 7.5 * u, cy), (cx - 2 * u, cy + 5.5 * u)), fill=col, width=int(2 * u * 2), joint="curve")
            self.d.line(P((cx - 2.5 * u, cy - 3.6 * u), (cx + 3.5 * u, cy + 0.2 * u), (cx - 2.5 * u, cy + 3.6 * u)), fill=mixc((16, 16, 24), col, 0.16), width=int(1.6 * u * 2), joint="curve")
        elif app == "terminal":                                    # >_
            self.d.line(P((cx - 7 * u, cy - 4.6 * u), (cx - 2.6 * u, cy), (cx - 7 * u, cy + 4.6 * u)), fill=col, width=int(2 * u * 2), joint="curve")
            self.d.line(P((cx + 0.5 * u, cy + 5 * u), (cx + 7.5 * u, cy + 5 * u)), fill=col, width=int(2 * u * 2))
        elif mode in ("chat", "cowork"):                           # a speech bubble with three dots
            self.d.rounded_rectangle([(cx - 8 * u) * 2, (cy - 7 * u) * 2, (cx + 8 * u) * 2, (cy + 3.5 * u) * 2], radius=int(3 * u * 2), fill=col)
            self.d.polygon(P((cx - 4.5 * u, cy + 3 * u), (cx - 5.5 * u, cy + 8 * u), (cx + 1 * u, cy + 3 * u)), fill=col)
            for dx in (-4, 0, 4):
                self.d.ellipse([(cx + dx * u - 1.1 * u) * 2, (cy - 2.5 * u - 1.1 * u) * 2, (cx + dx * u + 1.1 * u) * 2, (cy - 2.5 * u + 1.1 * u) * 2], fill=mixc((16, 16, 24), col, 0.16))
        else:                                                      # </>
            for sx in (-1, 1):
                self.d.line(P((cx + sx * 3.2 * u, cy - 5 * u), (cx + sx * 8 * u, cy), (cx + sx * 3.2 * u, cy + 5 * u)), fill=col, width=int(2 * u * 2), joint="curve")
            self.d.line(P((cx + 1.6 * u, cy - 6 * u), (cx - 1.6 * u, cy + 6 * u)), fill=col, width=int(1.8 * u * 2))
        bx, by, br = x + size - 3, y + size - 3, size * 0.27                       # badge
        self.d.ellipse([(bx - br) * 2, (by - br) * 2, (bx + br) * 2, (by + br) * 2], fill=(10, 10, 16), outline=(70, 74, 100), width=2)
        if host == "cloud":
            self.d.ellipse([(bx - br * 0.6) * 2, (by - br * 0.1) * 2, (bx + br * 0.6) * 2, (by + br * 0.5) * 2], fill=(190, 210, 255))
            self.d.ellipse([(bx - br * 0.3) * 2, (by - br * 0.6) * 2, (bx + br * 0.4) * 2, (by + br * 0.2) * 2], fill=(190, 210, 255))
        else:                                                    # a tiny laptop
            self.d.rounded_rectangle([(bx - br * 0.5) * 2, (by - br * 0.5) * 2, (bx + br * 0.5) * 2, (by + br * 0.15) * 2], radius=1, fill=(120, 235, 170))
            self.d.line([((bx - br * 0.7) * 2, (by + br * 0.4) * 2), ((bx + br * 0.7) * 2, (by + br * 0.4) * 2)], fill=(120, 235, 170), width=2)

    def state_pill(self, xr, yc, text, color, size=11):
        wd = self.width(text, size, "mono", True) + 18
        x0, y0, x1, y1 = xr - wd, yc - 10, xr, yc + 10
        self.rrect(x0, y0, x1, y1, 10, fill=mixc((0, 0, 0), color, 0.16))       # flat: a quiet tint of the state colour, no outline, no glow
        self.text(x0 + wd / 2, yc, text, size, color, "mono", True, "mm")
        return wd

    # ---------- the progress bar ----------
    def claude_bar(self, style, xa, y, xb, h, items, prog, tt, key):
        """Draws the bar `y..y+h` and returns (head x, foot y): where the mascot should stand."""
        n = len(items)
        if style not in ("neon", "plasma", "classic"):
            style = "neon"
        head_target = xa + (xb - xa) * prog
        if style in ("neon", "classic") and n >= 1:
            gap = 4 if style == "neon" else 3
            sw = (xb - xa - gap * (n - 1)) / n
            if sw >= (7 if style == "neon" else 4):
                return self._segments(style, xa, y, xb, h, items, sw, gap, tt, key)
            style = "flat" if style == "neon" else "plasma"
        if style == "classic":
            style = "plasma"
        hx = smooth(("h", key), head_target, tt)
        if style == "plasma":
            self._plasma(xa, y, xb, h, hx, tt)
            return hx, y - 0.5
        if style == "flat":                                # many tasks: one flat pixel bar, colour stepping every 8 px
            self.flat(xa, y, xb, y + h, (34, 34, 48))
            ex = xa + round((hx - xa) / 4) * 4
            for px in range(int(xa), int(ex), 8):
                c0, c1 = lerp_stops_pair(NEON, (px - xa) / max(1, xb - xa))
                self.flat(px, y, min(px + 8, ex), y + h, mixc(c0, c1, 0.5))
            if 0.5 + 0.5 * math.sin(tt * 2.6) > 0.35:
                self.flat(ex - 2, y - 2, ex + 2, y + h + 2, (255, 255, 255))
            return hx, y - 0.5
        return hx, y

    def _segments(self, style, xa, y, xb, h, items, sw, gap, tt, key):
        n, head = len(items), xa
        pulse = 0.5 + 0.5 * math.sin(tt * 2.6)
        sweep = xa + ((tt * 0.4) % 1.4 - 0.2) * (xb - xa)
        for i, st in enumerate(items):
            sx = xa + i * (sw + gap)
            if style == "classic":
                hh = min(8, h)
                yy = y + (h - hh) / 2
                if st == "p":
                    self.rrect(sx, yy, sx + sw, yy + hh, min(3, hh / 2), fill=(34, 34, 46))
                    continue
                head = sx + sw / 2 if st == "a" else sx + sw
                hue = mixc((217, 119, 87), (245, 197, 66), i / max(1, n - 1))
                base = hue if st == "c" else tuple(int(c * (0.4 + 0.6 * (0.5 + 0.5 * math.sin(tt * 5)))) for c in hue)
                light = max(0.0, 1 - abs(sx + sw / 2 - sweep) / 46)
                self.rrect(sx, yy, sx + sw, yy + hh, min(3, hh / 2), fill=mixc(base, (255, 255, 255), 0.4 * light))
                continue
            if style == "neon":                           # flat and pixelated: square edges, solid colours, steps of 4 px
                self.flat(sx, y, sx + sw, y + h, (34, 34, 48))
                if st == "p":
                    continue
                c0, c1 = lerp_stops_pair(NEON, i / max(1, n - 1))
                col = mixc(c0, c1, 0.5)
                if st == "a":
                    ex = sx + max(8, round(sw * (0.30 + 0.28 * (0.5 + 0.5 * math.sin(tt * 2.2 + i))) / 4) * 4)
                else:
                    ex = sx + sw
                self.flat(sx, y, ex, y + h, col)
                head = ex
                lo = max(sx, round((sweep - 6) / 4) * 4)                               # a 4 px light band stepping along the finished work
                hi = min(ex, lo + 4)
                if st == "c" and hi > lo:
                    self.flat(lo, y, hi, y + h, mixc(col, (255, 255, 255), 0.3))
                continue
            self.cap(sx, y, sx + sw, y + h, (34, 34, 48), (22, 22, 32))
            if st == "p":
                continue
            c0, c1 = lerp_stops_pair(NEON, i / max(1, n - 1))
            if st == "a":
                fr = 0.30 + 0.28 * (0.5 + 0.5 * math.sin(tt * 2.2 + i))
                ex = sx + max(h, sw * fr)
                self.cap(sx, y, ex, y + h, c0, c1)
                head = ex
            else:
                self.cap(sx, y, sx + sw, y + h, c0, c1)
                head = sx + sw
                lo, hi = max(sx + 4, sweep - 14), min(sx + sw - 4, sweep + 14)      # the light sweeping along the finished tasks
                if hi - lo > 3:
                    self.tint(lo, y + h * 0.16, hi, y + h * 0.42, (255, 255, 255), 0.45, h * 0.15)
        hx = smooth(("h", key), head, tt)
        if style == "neon":                               # a square blinking marker at the head
            if pulse > 0.35:
                self.flat(round(hx / 4) * 4 - 2, y - 2, round(hx / 4) * 4 + 2, y + h + 2, (255, 255, 255))
        return hx, y - 0.5

    def _plasma(self, xa, y, xb, h, hx, tt):
        S = 2
        self.cap(xa, y, xb, y + h, (34, 34, 48), (22, 22, 32))
        w = hx - xa
        if w < h * 0.6:
            return
        wp, hp = round(w * S), round(h * S)
        mk = ("pmask", wp, hp)
        mask = _caps.get(mk)
        if mask is None:
            mask = _caps[mk] = Image.new("L", (wp, hp), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, wp - 1, hp - 1], radius=hp / 2, fill=255)
        u = ((np.arange(wp) / max(1, round((xb - xa) * S))) * 0.9 + tt * 0.14) % 1.0
        cols = np.stack([np.interp(u, np.linspace(0, 1, len(FLOW)), [c[ch] for c in FLOW]) for ch in range(3)], axis=1)
        v = (1.12 - 0.34 * np.linspace(0, 1, hp))[:, None, None]
        arr = np.clip(cols[None, :, :] * v, 0, 255)
        gl = np.zeros((hp, 1, 1))
        gl[int(hp * 0.12):int(hp * 0.4)] = 0.30
        arr = arr * (1 - gl) + 255 * gl
        self.img.paste(Image.fromarray(arr.astype(np.uint8)), (round(xa * S), round(y * S)), mask)
        for i in range(9):                                                   # bubbles drifting up
            ph = (tt * 0.35 + i * 0.137) % 1.0
            bx = xa + 8 + ((i * 53) % max(1, int(w - 14)))
            by = y + h - 2 - ph * (h - 3)
            r = 1.0 + (i % 3) * 0.6
            self.tint(bx - r, by - r, bx + r, by + r, (255, 255, 255), 0.4 * (1 - ph), r)
        self.orb(hx, y + h / 2, h * 0.22, lerp_stops(FLOW, (tt * 0.14 + 0.9) % 1.0), 0.5)

    def cached(self, key, box, fn):
        """Draws a part of the widget that does not move once, then pastes it from a small cache (text rendering is the slow part of a frame)."""
        x0, y0, x1, y1 = (round(v * 2) for v in box)
        hit = _caps.get(("static", key))
        if hit is not None:
            self.img.paste(hit, (x0, y0))
            return
        fn()
        if len([k for k in _caps if k[0] == "static"]) > 24:
            for k in [k for k in _caps if k[0] == "static"][:12]:
                del _caps[k]
        _caps[("static", key)] = self.img.crop((x0, y0, x1, y1))

    # ---------- the widget ----------
    def w_claude_session(self, w):
        x0, y0, x1, y1 = self.rect(w)
        big, tall = w.get("w", 4) >= 4, w.get("h", 2) >= 2
        tt = self.t
        state = w.get("state", "none")
        working = state == "working"
        look, style = w.get("mascot") or "pip", w.get("bar") or "neon"
        age = (self.t - w["done_at"]) if w.get("done_at") else 99.0
        cheer = state == "idle" and 0 <= age < 4.2
        skey = state_key = "done" if cheer else "ask" if state == "working" and int(w.get("asking") or 0) else state
        sc = STATE_COL.get(skey, STATE_COL["none"])
        word = {"working": "WORKING", "idle": "IDLE", "none": "NO SESSION", "done": "DONE", "ask": "QUESTION"}[skey]
        if working and w.get("elapsed"):
            word += " · " + w["elapsed"]
        done_n, total = w.get("todo_done"), w.get("todo_total")
        states = (w.get("todo_states") or "") if w.get("todo_live", True) else ""
        steps = int(w.get("steps") or 0)
        agents = int(w.get("agents") or 0)
        act = w.get("activity") or "think"
        action = w.get("action") or ("Waiting for your next message" if state == "idle" else "")
        reply = w.get("reply") or ""
        # the first thing to read is what is happening right now; the session's name is only a small label
        prim = {"ask": "Claude has a question", "done": "Finished", "none": "No session"}.get(skey) or action or ("Working" if working else "")
        count = f"{done_n}/{total}" if states else (f"{steps} step{'s' if steps != 1 else ''}" if steps else "")
        if states:
            items = list(states)
            prog = (states.count("c") + 0.5 * states.count("a")) / len(items)
        else:
            items = ["c"] * min(max(steps, 1), 24)
            items[-1] = "a"
            prog = 1 - 1 / (1 + steps / 9.0) if steps else 0.03
        if state == "idle" and states:
            prog = states.count("c") / len(items)
        key = (w.get("col"), w.get("row"), w.get("w"), w.get("h"))
        kind = "done" if cheer else "sleep" if state in ("idle", "none") else KIND_OF.get(act, "thinker")
        crew_kinds = ("crew1", "crew2", "crew3", "crew1")
        title = w.get("title", "")
        mode = w.get("mode") or "code"
        wide = big and not tall
        cw = x1 - x0
        if big and tall:
            ic, ty, ax, ah, bh, ky = 20, 12, 14, 20, 16, 0.84
        elif wide:
            ic, ty, ax, ah, bh, ky = 20, 12, 14, 12, 10, 0.42
        else:
            ic, ty, ax, ah, bh, ky = 20, 14, 14, 11, 12, 0.62
        xa, xb = x0 + 14, x1 - 14

        def static():
            """Everything that does not move: chip, title, state pill, action, count (and the last words when idle). Drawn once, then pasted from a cache."""
            self.chip(x0 + 12, y0 + ty - ic / 2, ic, w.get("app", "desktop"), w.get("host", "local"), mode)
            tx = x0 + 12 + ic + 9
            pw = self.state_pill(x1 - 12, y0 + ty, word, sc, 11) if big else 0
            if big and tall:                                  # the session's name and where it runs: small and quiet
                tag = ("COWORK" if mode == "cowork" else "CHAT" if mode == "chat" else "CODE") + " · " + {"desktop": "DESKTOP", "code": "VS CODE", "terminal": "TERMINAL"}.get(w.get("app"), "")
                tw = self.width(tag, 9, "mono", True) + 12
                self.rrect(x1 - 12 - pw - 8 - tw, y0 + ty - 8, x1 - 12 - pw - 8, y0 + ty + 8, 8, fill=(26, 28, 40))
                self.text(x1 - 12 - pw - 8 - tw / 2, y0 + ty, tag, 9, (150, 158, 190), "mono", True, "mm")
                pw += tw + 8
                self.text(tx, y0 + ty, self.clip(title, 11, x1 - 12 - pw - 10 - tx), 11, (120, 128, 160), "label", True, "lm")
            else:                                             # smaller sizes: what is happening replaces the name on the top row
                self.text(tx, y0 + ty, self.clip(prim, 15 if wide else 14, x1 - 12 - pw - 10 - tx), 15 if wide else 14, (238, 238, 246), "label", True, "lm")
            if ay is not None:
                right = count if (working or (states and state == "idle")) else ""
                step = w.get("step_elapsed") or "" if working else ""
                rw = self.width(right, 12, "mono", True) + 10 if right else 0
                gx = 18 if working else 0
                sw_ = self.width(step, 11, "mono", False) + 8 if step else 0
                line, lsize, lrole = (prim, ah, "label") if tall and big else (word.split(" · ")[0], 10, "mono")     # narrow: the state word under the top row
                aw = min(self.width(line, lsize, lrole, True), xb - xa - rw - gx - sw_)
                self.text(xa + gx, ay, self.clip(line, lsize, xb - xa - rw - gx - sw_), lsize, (238, 238, 246) if lrole == "label" else sc, lrole, True, "lm")
                if step:
                    self.text(xa + gx + aw + 8, ay, step, 11, (150, 158, 190), "mono", False, "lm")
                if right:
                    self.text(xb, ay, right, 12, sc, "mono", True, "rm")
            if not (working or cheer):
                if big and tall:
                    self.reply_block(reply, w.get("scroll"), 12, xa, y0 + 66, 13, 3, xb - xa - 70, xb - 70)
                elif wide:
                    self.text(xa, y0 + 36, self.clip(reply, 12, xb - xa - 56), 12, (150, 158, 190), "label", False, "lm")
                else:
                    self.reply_block(reply, w.get("scroll"), 11, xa, y0 + 62, 13, 2, xb - xa - 36, xb - 40)

        if big and tall:
            ay, by = y0 + 42, y0 + 83
        elif wide:
            ay, by = None, y0 + 35
        else:
            ay, by = y0 + 46, y0 + 80
        self.cached(("cs", title, word, skey, w.get("app"), mode, w.get("host"), prim, count, w.get("step_elapsed") if working else "", working or cheer, reply if not (working or cheer) else "", w.get("scroll") if not (working or cheer) else 0,
                     x0, y0, x1, y1, bool(states and state == "idle")), (x0, y0, x1, y1), static)
        if working or cheer:
            if cheer and not working:
                items, prog = ["c"] * len(items), 1.0
            hx, foot = self.claude_bar(style, xa, by, xb, bh, items, prog, tt, key)
            if working and ay is not None:
                self.glyph(xa, ay, act, tt, sc)
            # sparkles trail the head
            if style in ("neon", "plasma", "classic") and hx - xa > 40:
                for j, off in enumerate((20, 44, 72)):
                    if math.sin(tt * 3 + j * 2.1) > 0.15 and hx - off > xa + 4:
                        self.sparkle(round(hx - off - 6), round(by - 8 - j * 3), (255, 214, 90))
            k = ky
            ck = k * 0.62
            span = 12 * k * 3
            for j in range(min(agents, 4)):
                self.mascot(look, crew_kinds[j], xb - 24 - j * (U * ck * 0.42) - 4, foot, ck, tt, phase=j * 0.3)
            mx = max(xa + 10 * k, min(hx - 2, xb - 22 * k - (min(agents, 4) * (U * ck * 0.42) + 8 if agents else 0)))
            jump = abs(math.sin(age * 7)) * 10 * max(0.0, 1 - age / 4) if cheer else 0
            self.mascot(look, kind, mx, foot, k, tt, jump=jump, moving=working)
            if wide and (working or cheer):
                pass
        else:
            self.mascot(look, "sleep", x1 - 14 - 22 * ky * 0.6, y1 - 2, ky * 0.95 if big and tall else ky, tt, moving=False)   # asleep in the corner
        if cheer:
            self.confetti(x0, y0, x1, y1, age)


def lerp_stops_pair(stops, u):
    """The (top, bottom) colours of the capsule at position u along the neon palette."""
    u = max(0.0, min(1.0, u)) * (len(stops) - 1)
    j = min(int(u), len(stops) - 2)
    f = u - j
    return mixc(stops[j][0], stops[j + 1][0], f), mixc(stops[j][1], stops[j + 1][1], f)


def ImageChops_lighter(a, b):
    from PIL import ImageChops
    return ImageChops.lighter(a, b)

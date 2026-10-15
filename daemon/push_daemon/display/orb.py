"""Dot orbs: a small cloud of dots that swirls into a different shape for each state (a mixin of render.Painter).

The maths is shared in spirit by ui/src/display/orb.ts and menubar/Sources/PushMenu/Orb.swift: change all three together.
Each dot sits on a sphere (golden-angle spiral); a state moves it, then the whole cloud is turned and tilted and drawn
with nearer dots bigger and brighter. The display background is always black, so "dimmer" simply means closer to black."""
import math

STATES = ("breathing", "working", "searching", "solving", "listening", "connecting", "composing", "weaving")
GA = 2.399963229728653   # the golden angle
TILT = 0.35
TAU = math.pi * 2


def _frac(v):
    return v - math.floor(v)


def points(state, t, n=72, level=None):
    """The dots at time t: a list of (x, y, depth 0..1 (1 = nearest), brightness 0..1), x and y in -1..1 of the orb's radius."""
    if level is None:
        level = 0.35 + 0.35 * math.sin(t * 2.6) ** 2   # no level given: a gentle pulse on its own
    out = []
    ct, st_ = math.cos(TILT), math.sin(TILT)
    ring_n = n / 3
    for i in range(n):
        h = _frac(i * 0.6180339887498949)
        u = 1 - 2 * (i + 0.5) / n
        s = math.sqrt(max(0.0, 1 - u * u))
        phi = i * GA
        x, y, z = s * math.cos(phi), u, s * math.sin(phi)
        yaw, bright = 0.0, 1.0
        if state == "breathing":
            r = 0.78 + 0.12 * math.sin(t * 1.5); yaw = t * 0.3
            x, y, z = x * r, y * r, z * r
        elif state == "working":
            r = 0.88 + 0.07 * math.sin(t * 6 + h * TAU); yaw = t * 2.4
            x, y, z = x * r, y * r, z * r
        elif state == "searching":
            yaw = t * 0.8
            bright = 0.35 + 0.65 * math.exp(-(((y - math.sin(t * 1.6) * 0.85) / 0.22) ** 2))
            x, y, z = x * 0.9, y * 0.9, z * 0.9
        elif state == "solving":
            k, m = i % 3, i // 3
            a = m / ring_n * TAU + t * (1.3 + 0.5 * k) * (-1 if k % 2 else 1)
            px, y = 0.9 * math.cos(a), 0.9 * math.sin(a)
            ang = k * math.pi / 3
            x, z = px * math.cos(ang), -px * math.sin(ang)
            yaw = t * 0.4
        elif state == "listening":
            r = 0.5 + level * 0.5 * (0.35 + 0.65 * abs(math.sin(h * 37 + t * 8)))
            yaw = t * 0.5; bright = 0.5 + 0.5 * min(1.0, level * 1.4)
            x, y, z = x * r, y * r, z * r
        elif state == "connecting":
            c = (t * 0.45) % 1
            q = min(c / 0.7, 1.0); k = q * q * (3 - 2 * q)
            r = 0.9 + (1 - k) * 1.3 * (0.3 + h)
            yaw = t * (0.5 + 1.5 * k); bright = 0.3 + 0.7 * k
            x, y, z = x * r, y * r, z * r
        elif state == "composing":
            r = 0.84 + 0.13 * math.sin(y * 6.5 - t * 3.5); yaw = t * 0.9
            x, y, z = x * r, y * r, z * r
        elif state == "weaving":
            a = t * 1.7
            x, y, z = x * 0.88, y * 0.88, z * 0.88
            if i % 2 == 0:
                x, z = x * math.cos(a) + z * math.sin(a), -x * math.sin(a) + z * math.cos(a)
            else:
                x, y = x * math.cos(-a) - y * math.sin(-a), x * math.sin(-a) + y * math.cos(-a)
        cy_, sy_ = math.cos(yaw), math.sin(yaw)
        x, z = x * cy_ + z * sy_, -x * sy_ + z * cy_
        y, z = y * ct - z * st_, y * st_ + z * ct
        out.append((x, y, max(0.0, min(1.0, (z + 1) / 2)), bright))
    return out


class OrbMixin:
    def dot_orb(self, cx, cy, radius, state, color, t=None, level=None, n=72, dot=None):
        """Draw an orb centred on (cx, cy) in logical pixels. color is an (r, g, b) tuple."""
        from .render import S as k   # (imported here: render.py imports this module)
        t = self.t if t is None else t
        dot = radius * 0.055 if dot is None else dot
        d = self.d
        for x, y, depth, bright in points(state, t, n, level):
            a = bright * (0.3 + 0.7 * depth)
            c = tuple(int(v * a) for v in color)
            r = dot * (0.5 + 0.8 * depth)
            px, py = (cx + x * radius) * k, (cy + y * radius) * k
            d.ellipse([px - r * k, py - r * k, px + r * k, py + r * k], fill=c)

    def w_orb(self, w):
        """A whole-display message with an orb: {state, text, sub, color}. Used where the Push is busy or resting."""
        col = tuple(int(v) for v in (w.get("color") or (255, 176, 64)))
        self.dot_orb(110, 80, 58, w.get("state", "breathing"), col)
        self.text(200, 66 if w.get("sub") else 80, w.get("text", ""), 34, (238, 238, 246), "label", True, "lm")
        if w.get("sub"):
            self.text(200, 104, w["sub"], 13, (120, 126, 156), "mono", False, "lm")

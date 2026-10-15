"""Python renderer for the display scene spec (mirrors ui/src/display/render.ts).

spec = {"accent": "#rrggbb", "zones": {control-id: {"label","icon","keep_case"}}, "active": [control-id],
        "widgets": [...], "toast": {"label","icon","value","text"} | None}
Everything is drawn at 2x and downsampled for smooth edges.
"""
import colorsys
import json
import math
import time

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

from .. import registry as R
from .. import scenes as base
from .tokens import TOKENS
from .render_claude import ClaudeMixin
from .render_ask import AskMixin
from .orb import OrbMixin

T = TOKENS
W, H = T["canvas"]["w"], T["canvas"]["h"]
G = T["grid"]
C = T["color"]
S = 2  # supersampling
_cache = {"key": None, "img": None}
ICON_LOOKUP = lambda key: None  # noqa: E731  app icon key -> PIL RGBA image
ART_LOOKUP = lambda key: None  # noqa: E731  the media hub sets this: artwork key -> PIL image (160x160)
# Where the now-playing visualizer draws, per layout: x0, x1, y0, y1, and how far the text block reaches from x0.


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def col(name_or_hex):
    return rgb(C.get(name_or_hex, name_or_hex))


_DARK = {}


def _is_dark(im):
    """True when the picture's visible pixels are all near black (cached per picture)."""
    k = id(im)
    if k not in _DARK:
        px = [p for p in im.resize((16, 16)).getdata() if p[3] > 128]
        _DARK[k] = bool(px) and sum(max(p[:3]) for p in px) / len(px) < 70
    return _DARK[k]


class Painter(ClaudeMixin, AskMixin, OrbMixin):
    def __init__(self, spec, t):
        self.spec, self.t = spec, t
        self.accent = rgb(spec.get("accent", "#d97757"))
        self.img = Image.new("RGB", (W * S, H * S), rgb(C["bg"]))
        self.d = ImageDraw.Draw(self.img)

    # --- primitives (logical coordinates) ---
    def text(self, x, y, s, size, color, role="label", bold=True, anchor="mm"):
        f = base.font(int(size * S), bold, "label") if role == "label" else base.font(int(size * S), bold, "mono")
        self.d.text((x * S, y * S), s, font=f, fill=color, anchor=anchor)

    def width(self, s, size, role="label", bold=True):
        return base.font(int(size * S), bold, role).getlength(s) / S

    def rrect(self, x0, y0, x1, y1, r, fill=None, outline=None, width=1):
        self.d.rounded_rectangle([x0 * S, y0 * S, x1 * S, y1 * S], radius=r * S, fill=fill, outline=outline, width=int(width * S))

    def icon(self, name, cx, cy, size, color, width=2):
        x0, y0 = cx - size / 2, cy - size / 2
        for sh in base.ICONS.get(name, []):
            if "c" in sh:
                c = sh["c"]
                self.d.ellipse([(x0 + (c[0] - c[2]) * size) * S, (y0 + (c[1] - c[2]) * size) * S,
                                (x0 + (c[0] + c[2]) * size) * S, (y0 + (c[1] + c[2]) * size) * S], outline=color, width=int(width * S))
            else:
                pts = [((x0 + x * size) * S, (y0 + y * size) * S) for x, y in sh["p"]]
                if sh.get("fill"):
                    self.d.polygon(pts, fill=color)
                else:
                    self.d.line(pts + ([pts[0]] if sh.get("closed") else []), fill=color, width=int(width * S), joint="curve")

    # --- zones: the 16 label zones, one row each: [icon] LABEL ---
    def fit(self, text, has_icon, maxw, bold=False):
        """One line, 14 px when it fits (with its icon if there is room). Otherwise the icon goes, then the size steps down (13 to 9) so the
        whole label shows. Never '...': only a label too long even at 9 px loses its last letters."""
        if has_icon and self.width(text, 14, "mono", bold) + 20 <= maxw:
            return text, True, 14
        for size in (14, 13, 12, 11, 10, 9):
            if self.width(text, size, "mono", bold) <= maxw:
                return text, False, size
        while len(text) > 1 and self.width(text, 9, "mono", bold) > maxw:
            text = text[:-1]
        return text, False, 9

    def zones(self):
        """Each button's label sits in a 24 px strip; the open / active / pressed one gets a bar along its bottom edge instead of a fill."""
        zs, active = self.spec.get("zones", {}), set(self.spec.get("active", []))
        for top, ids in ((True, R.UPPER), (False, R.LOWER)):
            for i, cid in enumerate(ids):
                e = zs.get(cid) or {}
                x0 = i * G["col_w"] + (G["col_w"] - G["zone_w"]) / 2
                y0 = G["zone_margin"] if top else H - G["zone_margin"] - G["zone_h"]
                cx, cy = x0 + G["zone_w"] / 2, y0 + 10
                text = (e.get("label") or "").strip()
                if text and not e.get("keep_case"):
                    text = text.upper()
                icon = e.get("icon")
                if not text and not icon:
                    continue  # nothing assigned: nothing drawn
                on = cid in active or bool(e.get("bar"))   # pressed / open: bold label and a bar
                lit = on or bool(e.get("lit"))              # lit (saved, shuffle on): bold and bright, no bar
                color = col("ink") if lit else col("ink3")
                if e.get("dim"):   # a widget's button while its app is not in front: faded, and it does nothing
                    color = col("ink4")
                glow = (self.spec.get("glow") or {}).get(cid, 0)
                if glow:  # a press lights the strip from its bar upward; on release it fades (idle -> on -> pressed)
                    gc = rgb(e["bar_color"]) if e.get("bar_color") else self.accent
                    for k in range(14):
                        a = glow * 0.32 * (1 - k / 14) ** 1.6
                        yy = y0 + G["zone_h"] - 2.5 - (k + 1)
                        self.d.rectangle([x0 * S, yy * S, (x0 + G["zone_w"]) * S - 1, (yy + 1) * S - 1], fill=tuple(int(c * a) for c in gc))
                if text:
                    text, use_icon, size = self.fit(text, bool(icon), G["zone_w"] - 4, lit)
                    if use_icon:
                        sx = cx - (size + 6 + self.width(text, size, "mono", lit)) / 2
                        self.icon(icon, sx + size / 2, cy, size, rgb(e["icon_color"]) if e.get("icon_color") else color)
                        self.text(sx + size + 6, cy, text, size, color, "mono", lit, "lm")
                    else:
                        self.text(cx, cy, text, size, color, "mono", lit, "mm")
                else:
                    self.icon(icon, cx, cy + 1, 16, rgb(e["icon_color"]) if e.get("icon_color") else color)
                if on:  # 1.5 px bar on the button's bottom edge, the full width of the button
                    self.rrect(x0, y0 + G["zone_h"] - 2.5, x0 + G["zone_w"], y0 + G["zone_h"] - 1, 0.75, fill=rgb(e["bar_color"]) if e.get("bar_color") else self.accent)

    # --- widgets ---
    def box(self, w):
        x0 = w.get("col", 0) * G["col_w"]
        return x0, w.get("w", w.get("span", 1)) * G["col_w"]

    def rect(self, w):
        """The widget's cell(s): 8 columns x 2 rows of 120 x 50 px between the label rows."""
        x0, ww = self.box(w)
        y0 = G["body_top"] + w.get("row", 0) * 50
        return x0, y0, x0 + ww, y0 + w.get("h", 2) * 50

    def widget(self, w):
        getattr(self, "w_" + w["type"], lambda w: None)(w)

    def w_title(self, w):
        x0, ww = self.box(w)
        cx = x0 + ww / 2
        size = T["type"][w.get("size", "title")]
        ink = col(w.get("color", "ink"))
        if w.get("sub"):
            self.text(cx, 74, w["text"], size, ink)
            self.text(cx, 74 + size / 2 + 16, w["sub"], T["type"]["note"], col(w.get("sub_color", "ink3")), "mono", False)
        else:
            self.text(cx, 80, w["text"], size, ink)

    # --- grid widgets: each draws inside its own cell(s) (see rect) ---
    def w_profile(self, w):
        """Which profile is active: its icon (or a dot in its colour) and its name. Nothing else; Auto / Master is the Master button's state."""
        x0, y0, x1, y1 = self.rect(w)
        cy, accent = (y0 + y1) / 2, rgb(w.get("accent") or "#6b6b78")
        src = ICON_LOOKUP(w["icon"]) if w.get("icon") else None
        if src is not None:
            ic = src.resize((30 * S, 30 * S), Image.LANCZOS)
            self.img.paste(ic, (int((x0 + 14) * S), int((cy - 15) * S)), ic)
        else:
            self.rrect(x0 + 20, cy - 6, x0 + 32, cy + 6, 6, fill=accent)
        tx = x0 + 54
        self.text(tx, cy, self.clip(w.get("name", ""), 17, x1 - 12 - tx), 17, col("ink"), "label", True, "lm")

    def w_tab(self, w):
        """The browser's active tab: the browser's icon, the site, and the page title."""
        x0, y0, x1, y1 = self.rect(w)
        cy = (y0 + y1) / 2
        src = ICON_LOOKUP(w["icon"]) if w.get("icon") else None
        if src is not None:
            ic = src.resize((26 * S, 26 * S), Image.LANCZOS)
            self.img.paste(ic, (int((x0 + 14) * S), int((cy - 13) * S)), ic)
        tx = x0 + 50
        ink = col("ink3") if w.get("idle") else col("ink")
        if w.get("host"):
            self.text(tx, cy - 9, w["host"], 12, col("ink3"), "mono", False, "lm")
            self.text(tx, cy + 10, self.clip(w.get("title", ""), 15, x1 - 14 - tx), 15, ink, "label", True, "lm")
        else:
            self.text(tx, cy, self.clip(w.get("title", ""), 15, x1 - 14 - tx), 15, ink, "label", True, "lm")

    def dl_line(self, w, x, y, maxw):
        """One line about the download in progress (or just finished): name, size so far and speed, and a bar. Returns False when there is none."""
        d = w.get("dl") or {}
        if not (d.get("active") or d.get("done")):
            return False
        done = d.get("done")
        c = rgb("#7ed37f") if done else rgb("#6aa7ff")
        self.text(x, y, self.clip(("Downloaded  " if done else "") + d["name"], 12, maxw - 150), 12, col("ink"), "label", True, "lm")
        self.text(x + maxw, y, " · ".join(v for v in (d["size"], d["speed"]) if v), 11, col("ink3"), "mono", False, "rm")
        self.rrect(x, y + 11, x + maxw, y + 14, 1.5, fill=col("track"))
        if done:
            self.rrect(x, y + 11, x + maxw, y + 14, 1.5, fill=c)
        else:                                      # the total size is not known: a bar that sweeps
            p = (self.t * 0.8) % 1
            a, b = x + (maxw - 60) * p, x + (maxw - 60) * p + 60
            self.rrect(a, y + 11, b, y + 14, 1.5, fill=c)
        return True

    def dl_block(self, d, x, y, maxw):
        """The download as three short lines in the gap between the favourite rows: name, a bar, then size and speed."""
        done = d.get("done")
        c = rgb("#7ed37f") if done else rgb("#6aa7ff")
        self.text(x, y, self.clip(("Downloaded " if done else "") + d["name"], 12, maxw), 12, col("ink"), "label", True, "lm")
        self.rrect(x, y + 12, x + maxw, y + 16, 2, fill=col("track"))
        if done:
            self.rrect(x, y + 12, x + maxw, y + 16, 2, fill=c)
        else:
            a = x + (maxw - 50) * ((self.t * 0.8) % 1)
            self.rrect(a, y + 12, a + 50, y + 16, 2, fill=c)
        self.text(x, y + 28, self.clip(" · ".join(v for v in (d["size"], d["speed"]) if v), 11, maxw), 11, col("ink3"), "mono", False, "lm")

    def site_tile(self, x, y, size, icon, mono, hue, radius=10):
        """A site's tile: its own icon when it has been fetched, else its first letter on its colour."""
        src = ICON_LOOKUP(icon) if icon else None
        if src is not None:
            n = size                                      # an icon that was fetched stands on its own: no tile behind it
            if _is_dark(src):                             # an all-black icon would vanish on the black display: a white frame behind it
                self.rrect(x, y, x + size, y + size, radius, fill=(255, 255, 255))
                n = round(size * 0.78)
            ic = src.resize((n * S, n * S), Image.LANCZOS)
            self.img.paste(ic, (int((x + (size - n) / 2) * S), int((y + (size - n) / 2) * S)), ic)
        else:
            hc = rgb(hue or "#d97757")
            self.rrect(x, y, x + size, y + size, radius, fill=mixc_(hc, 0.28))
            self.text(x + size / 2, y + size / 2, mono or "?", size * 0.55, hc, "label", True, "mm")

    def dashed_rrect(self, x0, y0, x1, y1, r, color, dash=5, gap=4):
        """A dashed rounded rectangle: the outline walked as a path and drawn in short pieces."""
        pts = []
        for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
            for k in range(7):
                a = math.radians(a0 + k * 15)
                pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        pts.append(pts[0])
        run, on = 0.0, True
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            seg = math.hypot(bx - ax, by - ay)
            if seg == 0:
                continue
            pos = 0.0
            while pos < seg:
                step = min(seg - pos, (dash if on else gap) - run)
                if on:
                    self.d.line([((ax + (bx - ax) * pos / seg) * S, (ay + (by - ay) * pos / seg) * S),
                                 ((ax + (bx - ax) * (pos + step) / seg) * S, (ay + (by - ay) * (pos + step) / seg) * S)], fill=color, width=S)
                pos += step
                run += step
                if run >= (dash if on else gap) - 1e-6:
                    on, run = not on, 0.0

    def fav_tile(self, x, y, f, w=106, h=46):
        """One favourite over its button: its icon and its name cut to two short lines; outlined when it is the open tab, a dashed outline when the slot is empty."""
        if f is None:
            self.dashed_rrect(x, y, x + w, y + h, 10, (86, 88, 104))
            return
        if f.get("open"):                                   # only the open one has a fill, in its button's colour
            self.rrect(x, y, x + w, y + h, 10, fill=mixc_(rgb(f.get("color") or "#6aa7ff"), 0.30))
        self.site_tile(x + 6, y + 6, h - 12, f.get("icon"), f.get("mono"), f.get("hue"), 8)
        lines = self.lines_n(f.get("title") or "", 10.5, w - h - 4, 2, "label", True)
        for i, ln in enumerate(lines):
            self.text(x + h - 2, y + h / 2 + (i - (len(lines) - 1) / 2) * 12, ln, 10.5, col("ink") if f.get("open") else col("ink2"), "label", True, "lm")

    def w_browser(self, w):
        """The browser's active tab on the body, and the favourites as tiles drawn over their own buttons (the labels there are gone): four on the lower
        row of the 4-wide one; on the 6-wide one six on the lower row and two on the upper row, in its last two columns. A tiny pop on the star says a
        favourite was added or removed. Mirrors the 'browser' case in ui/src/display/render.ts."""
        x0, y0, x1, y1 = self.rect(w)
        if x1 - x0 < 300:                                     # squeezed to 2 columns (the media player is over the rest): tab info and the first two favourites
            return self.w_browser_compact(w, x0, y0, x1)
        wide = (x1 - x0) >= 600
        ix1 = x0 + 360                                        # the upper favourites take the columns to the right of this
        self.site_tile(x0 + 14, y0 + 4, 46, w.get("icon"), w.get("mono"), w.get("hue"), 11)
        tx = x0 + 72
        dl = w.get("dl") or {}
        pop = w.get("pop") or {}
        age = pop.get("age", 9)
        by = y0 + 62
        if True:
            self.text(tx, y0 + 14, w.get("host") or "", 12, col("ink3"), "mono", False, "lm")
            self.text(tx, y0 + 38, self.clip(w.get("title", ""), 17, ix1 - 100 - tx), 17, col("ink3") if w.get("idle") else col("ink"), "label", True, "lm")
            sx, sy = ix1 - 28, y0 + 38
            bump = max(0.0, 1 - age / 0.6) if pop.get("kind") in ("added", "removed") else 0.0
            self.icon("starfill" if w.get("saved") else "star", sx, sy, 18 + 10 * bump, rgb("#f5c542") if w.get("saved") else col("ink3"), 1.5)
            if pop.get("kind") == "added" and age < 0.7:
                r, fade = 8 + age * 26, 1 - age / 0.7
                self.d.ellipse([(sx - r) * S, (sy - r) * S, (sx + r) * S, (sy + r) * S], outline=tuple(int(v * fade) for v in rgb("#f5c542")), width=S)
                for k in range(6):
                    a = k * math.pi / 3 + 0.4
                    self.sparkle(sx + math.cos(a) * (r + 4), sy + math.sin(a) * (r + 4), tuple(int(v * fade) for v in rgb("#ffe08a")))
            if pop and age < 1.4:
                msg, mc = {"added": ("ADDED", "#7ed37f"), "removed": ("REMOVED", "#9a9aa8"), "full": ("FULL", "#ff7a59"), "error": ("NO ANSWER", "#ff7a59")}.get(pop.get("kind"), ("", "#fff"))
                self.text(ix1 - 14, y0 + 14, msg, 11, rgb(mc), "mono", True, "rm")
            elif w.get("loading"):
                self.text(ix1 - 14, y0 + 14, "LOADING", 11, tuple(int(v * (0.55 + 0.45 * math.sin(self.t * 6))) for v in rgb("#ffb040")), "mono", True, "rm")
            elif not w.get("idle"):
                self.text(ix1 - 14, y0 + 14, "SECURE" if w.get("secure") else "NOT SECURE", 11, rgb("#7ed37f") if w.get("secure") else rgb("#ff7a59"), "mono", True, "rm")
            if w.get("loading"):
                self.rrect(tx, by, ix1 - 14, by + 3, 1.5, fill=col("track"))
                a = tx + (ix1 - 14 - tx - 90) * ((self.t * 0.9) % 1)
                self.rrect(a, by, a + 90, by + 3, 1.5, fill=rgb("#ffb040"))
            else:
                n, pages = int(w.get("n_saved", 0)), int(w.get("pages", 1))
                self.text(tx, by + 4, f"{n} favourite{'' if n == 1 else 's'}" + (f"  ·  page {int(w.get('page', 0)) + 1}/{pages}" if pages > 1 else ""), 11, col("ink3"), "mono", False, "lm")
                for k in range(pages if pages > 1 else 0):          # a dot per page, the current one bright
                    self.d.ellipse([(ix1 - 14 - (pages - k) * 10 + 3) * S, (by + 1) * S, (ix1 - 14 - (pages - k) * 10 + 9) * S, (by + 7) * S], fill=rgb("#f5c542") if k == int(w.get("page", 0)) else col("ink4"))
        if dl.get("active") or dl.get("done"):            # the download sits in the gap between the two rows of favourite tiles
            self.dl_block(dl, ix1 + 7, y0 + 30, (x1 - 7 if wide else x0 + 473) - (ix1 + 7))
        favs = w.get("favs") or []
        for i in range(6 if wide else 4):                     # lower row: favourites 1-6 (1-4), each tile over its button
            self.fav_tile(x0 + i * 120 + 7, 110, favs[i] if i < len(favs) else None)
        for j, i in enumerate((6, 7, 8) if wide else (4,)):   # upper row: the rest of the page, in the last columns
            self.fav_tile(x0 + (3 + j) * 120 + 7, 4, favs[i] if i < len(favs) else None)

    def tomato(self, cx, cy, r, color):
        """A tomato: a round body with a highlight and a green leaf on top. No colour draws just an empty outline (a round still to come)."""
        if color is None:
            self.d.ellipse([(cx - r) * S, (cy - r * 0.9) * S, (cx + r) * S, (cy + r * 0.9) * S], outline=col("ink4"), width=S)
            return
        c = rgb(color)
        self.d.ellipse([(cx - r) * S, (cy - r * 0.9) * S, (cx + r) * S, (cy + r * 0.9) * S], fill=c)
        self.d.ellipse([(cx - r * 0.6) * S, (cy - r * 0.6) * S, (cx - r * 0.2) * S, (cy - r * 0.3) * S], fill=mixc_(c, 1.0) if False else tuple(min(255, v + 70) for v in c))
        g = rgb("#3f9b4a")
        top = cy - r * 0.85
        for dx, dy in ((-0.75, -0.25), (0.75, -0.25), (-0.35, 0.15), (0.35, 0.15)):       # leaf points spreading from the stem
            self.d.polygon([(cx * S, top * S), ((cx + dx * r) * S, (top + dy * r - r * 0.1) * S), ((cx + dx * r * 0.45) * S, (top + r * 0.28) * S)], fill=g)
        self.d.line([(cx * S, (top - r * 0.35) * S), (cx * S, top * S)], fill=g, width=max(S, int(r * 0.14 * S)))

    def w_browser_compact(self, w, x0, y0, x1):
        """The browser widget at 2 x 2: favicon, site and title, the star, loading or the download, and favourites 1 and 2 over their buttons.
        Mirrors the compact branch of 'browser' in ui/src/display/render.ts."""
        self.site_tile(x0 + 14, y0 + 4, 46, w.get("icon"), w.get("mono"), w.get("hue"), 11)
        tx = x0 + 72
        self.text(tx, y0 + 14, self.clip(w.get("host") or "", 12, x1 - 14 - tx - 20), 12, col("ink3"), "mono", False, "lm")
        self.text(tx, y0 + 38, self.clip(w.get("title", ""), 15, x1 - 14 - tx), 15, col("ink3") if w.get("idle") else col("ink"), "label", True, "lm")
        pop = w.get("pop") or {}
        age = pop.get("age", 9)
        bump = max(0.0, 1 - age / 0.6) if pop.get("kind") in ("added", "removed") else 0.0
        self.icon("starfill" if w.get("saved") else "star", x1 - 22, y0 + 14, 14 + 8 * bump, rgb("#f5c542") if w.get("saved") else col("ink3"), 1.5)
        dl = w.get("dl") or {}
        if dl.get("active") or dl.get("done"):
            self.dl_line(w, x0 + 14, y0 + 66, x1 - x0 - 28)
        elif w.get("loading"):
            self.rrect(x0 + 14, y0 + 70, x1 - 14, y0 + 73, 1.5, fill=col("track"))
            a = x0 + 14 + (x1 - x0 - 28 - 90) * ((self.t * 0.9) % 1)
            self.rrect(a, y0 + 70, a + 90, y0 + 73, 1.5, fill=rgb("#ffb040"))
        else:
            n = int(w.get("n_saved", 0))
            self.text(x0 + 14, y0 + 70, f"{n} favourite{'' if n == 1 else 's'}", 11, col("ink3"), "mono", False, "lm")
        favs = w.get("favs") or []
        for i in range(2):
            self.fav_tile(x0 + i * 120 + 7, 110, favs[i] if i < len(favs) else None)

    def w_download(self, w):
        x0, y0, x1, y1 = self.rect(w)
        if not self.dl_line(w, x0 + 14, y0 + 16, x1 - x0 - 28):
            self.text(x0 + 14, (y0 + y1) / 2, "No downloads", 13, col("ink4"), "label", True, "lm")

    def w_clock(self, w):
        """Three clocks, all with the time and date: 2 x 1 time with the date stacked on the right; 2 x 2 big time, date and a bar for how
        much of the day has gone; 2 x 2 "analog" a dial with hands beside the time. Mirrors widget() "clock" in render.ts."""
        import math
        x0, y0, x1, y1 = self.rect(w)
        look = w.get("mascot") or "pip"
        t, date = w.get("time", ""), w.get("date", "")
        try:
            hh, mm = (int(v) for v in t.split(":"))
        except ValueError:
            hh = mm = 0
        ap = w.get("ampm") or ""
        h24 = (hh % 12 + (12 if ap == "PM" else 0)) if ap else hh
        night = h24 >= 22 or h24 < 6                       # the little worker sleeps at night
        orange = rgb("#d97757")
        if w.get("h", 2) == 1 and w.get("timer"):   # the 2 x 1 clock while it is the timer: time left, state, a bar of what is left
            tm = w["timer"]
            flash = tm["state"] == "done" and int(self.t * 2) % 2 == 0
            pomo = tm.get("dots") is not None
            if tm["state"] == "done":
                self.buddy(look, "done", x0 + 122, y0 + 38, 1, jump=abs(math.sin(self.t * 7)) * 5)
            elif pomo and (tm["state"] == "pause" or tm.get("phase") != "focus"):
                self.buddy(look, "plain", x0 + 122, y0 + 38, 1, tomato=True)
            elif tm["state"] == "pause":
                self.buddy(look, "sleep", x0 + 122, y0 + 38, 1)
            else:
                self.buddy(look, "timer", x0 + 122, y0 + 38, 1, tomato=pomo)
            self.text(x0 + 14, y0 + 25, tm["text"], 30, col("warn") if flash else col("ink"), "label", True, "lm")
            self.text(x1 - 14, y0 + 18, tm.get("kind", "TIMER"), 12, col("ink2"), "mono", False, "rm")
            self.text(x1 - 14, y0 + 34, tm["label"], 12, col("warn") if flash else col("ink3"), "mono", False, "rm")
            self.rrect(x0 + 14, y0 + 44, x1 - 14, y0 + 47, 1.5, fill=col("track"))
            if tm["frac"] > 0:
                self.rrect(x0 + 14, y0 + 44, x0 + 14 + max(3, (x1 - x0 - 28) * tm["frac"]), y0 + 47, 1.5, fill=col("ink3") if tm["state"] == "pause" else rgb(tm["color"]) if tm.get("color") else col("ink2"))
        elif w.get("h", 2) == 1:
            sep = date.find(",") if "," in date else date.find(" ")
            day, rest = (date[:sep], date[sep + 1:].strip()) if sep > 0 else (date, "")
            self.text(x0 + 14, y0 + 25, t, 30, col("ink"), "label", True, "lm")
            if ap:
                self.text(x0 + 14 + self.width(t, 30, "label", True) + 4, y0 + 31, ap, 12, col("ink2"), "mono", False, "lm")
            self.buddy(look, "sleep" if night else "plain", x0 + 122, y0 + 38, 1)
            self.text(x1 - 14, y0 + 18, day, 12, col("ink2"), "mono", False, "rm")
            self.text(x1 - 14, y0 + 34, rest, 12, col("ink3"), "mono", False, "rm")
        elif w.get("timer"):                                  # the 2 x 2 clocks while it is the timer: a big countdown, its state, a bar of what is left
            tm = w["timer"]
            flash = tm["state"] == "done" and int(self.t * 2) % 2 == 0
            self.text(x0 + 14, y0 + 34, tm["text"], 48, col("warn") if flash else col("ink"), "label", True, "lm")
            self.text(x0 + 14, y0 + 60, tm.get("kind", "TIMER") + "  ·  " + tm["label"].upper(), 13, col("warn") if flash else col("ink3"), "mono", False, "lm")
            xa, xb = x0 + 14, x1 - 14
            self.rrect(xa, y0 + 88, xb, y0 + 92, 2, fill=col("track"))
            if tm["frac"] > 0:
                self.rrect(xa, y0 + 88, xa + max(4, (xb - xa) * tm["frac"]), y0 + 92, 2, fill=col("ink3") if tm["state"] == "pause" else rgb(tm["color"]) if tm.get("color") else orange)
            if tm.get("dots") is not None:                    # pomodoro: a tomato per focus round done in this set of four, and a big one that bobs
                for k in range(4):
                    self.tomato(xa + k * 15 + 5, y0 + 77, 5, "#e5483b" if k < int(tm["dots"]) else None)
            pomo = tm.get("dots") is not None                  # the pomodoro's mascot is a tomato: it holds the timer while focusing and rests on a break
            kind = "done" if tm["state"] == "done" else "plain" if pomo and (tm["state"] == "pause" or tm.get("phase") != "focus") else "sleep" if tm["state"] == "pause" else "timer"
            self.buddy(look, kind, x1 - 36, y0 + 87, 2, jump=abs(math.sin(self.t * 7)) * 5 if kind == "done" else 0.0, tomato=pomo)
        elif w.get("style") == "analog":
            cx, cy, r = x0 + 14 + 38, y0 + 50, 36
            for k in range(12):
                a = k * math.pi / 6
                r0 = r - (9 if k % 3 == 0 else 5)
                self.d.line([((cx + r0 * math.sin(a)) * S, (cy - r0 * math.cos(a)) * S), ((cx + r * math.sin(a)) * S, (cy - r * math.cos(a)) * S)],
                            fill=col("ink") if k % 3 == 0 else col("ink3"), width=int((2 if k % 3 == 0 else 1.5) * S))
            for ang, ln, wd, c in (((hh % 12 + mm / 60) / 12 * 2 * math.pi, 19, 4, "ink"), (mm / 60 * 2 * math.pi, 28, 3, "ink2")):
                self.d.line([(cx * S, cy * S), ((cx + ln * math.sin(ang)) * S, (cy - ln * math.cos(ang)) * S)], fill=col(c), width=int(wd * S), joint="curve")
            self.d.ellipse([(cx - 3) * S, (cy - 3) * S, (cx + 3) * S, (cy + 3) * S], fill=col("ink"))
            self.text(cx + r + 18, y0 + 42, t, 30, col("ink"), "label", True, "lm")
            if ap:
                self.text(cx + r + 18 + self.width(t, 30, "label", True) + 4, y0 + 48, ap, 12, col("ink2"), "mono", False, "lm")
            self.text(cx + r + 18, y0 + 66, date, 13, col("ink3"), "mono", False, "lm")
            sec = time.localtime(self.t).tm_sec   # a thin second hand, ticking
            sa = sec / 60 * 2 * math.pi
            self.d.line([(cx * S, cy * S), ((cx + 31 * math.sin(sa)) * S, (cy - 31 * math.cos(sa)) * S)], fill=orange, width=int(1.5 * S))
            self.buddy(look, "sleep" if night else "plain", x1 - 28, y0 + 94, 1)
        else:
            self.text(x0 + 14, y0 + 34, t, 48, col("ink"), "label", True, "lm")
            if ap:
                self.text(x0 + 14 + self.width(t, 48, "label", True) + 6, y0 + 44, ap, 14, col("ink2"), "mono", False, "lm")
            self.text(x0 + 14, y0 + 60, date, 14, col("ink3"), "mono", False, "lm")
            xa, xb, frac = x0 + 14, x1 - 14, (h24 * 60 + mm) / 1440   # the day bar: night blue, noon gold, evening orange; the worker stands at "now"
            self.rrect(xa, y0 + 88, xb, y0 + 92, 2, fill=col("track"))
            stops = [(0, (74, 90, 154)), (0.3, (245, 197, 66)), (0.6, (245, 197, 66)), (0.85, (217, 119, 87)), (1.0, (74, 90, 154))]
            for px in range(0, max(2, int((xb - xa) * frac)), 2):
                u = px / (xb - xa)
                j = next(i for i in range(1, len(stops)) if u <= stops[i][0] or i == len(stops) - 1)
                (u0, c0), (u1, c1) = stops[j - 1], stops[j]
                self.d.rectangle([(xa + px) * S, (y0 + 88) * S, (xa + px + 2) * S - 1, (y0 + 92) * S - 1], fill=self.mix(c0, c1, (u - u0) / (u1 - u0)))
            self.buddy(look, "sleep" if night else "plain", max(xa, min(xa + (xb - xa) * frac - 12, xb - 24)), y0 + 87, 2)

    def wrap(self, text, size, maxw, role="mono"):
        """Word-wrap `text` into lines no wider than maxw (a word longer than a line is cut)."""
        lines, cur = [], ""
        for word in text.split():
            while self.width(word, size, role, False) > maxw and len(word) > 1:
                k = len(word)
                while k > 1 and self.width(word[:k], size, role, False) > maxw:
                    k -= 1
                if cur:
                    lines.append(cur)
                    cur = ""
                lines.append(word[:k])
                word = word[k:]
            t = (cur + " " + word).strip()
            if cur and self.width(t, size, role, False) > maxw:
                lines.append(cur)
                cur = word
            else:
                cur = t
        if cur:
            lines.append(cur)
        return lines

    def reply_block(self, text, scroll, size, x, y_first, pitch, n, maxw, xr):
        """The last reply as up to n wrapped lines from line `scroll`; small arrows on the right when there is more above or below."""
        lines = self.wrap(text, size, maxw)
        top = max(0, min(int(scroll or 0), max(0, len(lines) - n)))
        for i, ln in enumerate(lines[top:top + n]):
            self.text(x, y_first + i * pitch, ln, size, col("ink3"), "mono", False, "lm")
        if top > 0:
            self.icon("arrowup", xr, y_first, 8, col("ink2"), 1.4)
        if top + n < len(lines):
            self.icon("arrowdown", xr, y_first + (n - 1) * pitch, 8, col("ink2"), 1.4)

    PROP_PAL = {"w": "#e8e8ee", "g": "#9a9aa6", "y": "#f5c542", "p": "#ff8fb1", "e": "#7ed37f"}

    def pixels(self, rows, x, y, k, pal):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                c = pal.get(ch)
                if c:
                    px0, py0 = round(x + i * k), round(y + j * k)
                    self.d.rectangle([px0 * S, py0 * S, max(px0 + 1, round(x + (i + 1) * k)) * S - 1, max(py0 + 1, round(y + (j + 1) * k)) * S - 1], fill=c)

    def critter(self, x, bottom, k, body, activity="", phase=0.0, sleep=False, jump=0.0, slow=False):
        """A little pixel worker: standing on `bottom`, left edge at x, k display px per sprite pixel. Walks in place holding the prop of what it is doing,
        or (sleep) sits with its eyes low, breathing, with z's floating up; `jump` lifts it (celebrating); `slow` is a calmer walk for the quiet widgets."""
        sp = T["sprites"]["pip"]
        rgbb = rgb(body) if isinstance(body, str) else body
        pal = {"o": rgbb, "c": rgbb, "l": tuple(int(c * 0.62) for c in rgbb), "k": (26, 26, 31)}
        bottom -= jump
        if sleep:
            top = bottom - 7 * k - (1 if int(self.t * 1.2) % 2 else 0)
            self.pixels(sp["sleep"], x, top, k, pal)
            for j in (0, 1):
                ph = (self.t * 0.5 + j * 0.5) % 1
                self.text(x + 12 * k + 2 + ph * 8, top - 2 - ph * 12, "z", 9 + 3 * j, tuple(int(v * (1 - ph)) for v in col("ink2")), "mono", True, "lm")
            return
        fr = int(self.t * (2 if slow else 4) + phase) % 2
        top = bottom - 8 * k - (k if fr else 0)
        self.pixels(sp["frames"][fr], x, top, k, pal)
        prop = T["sprites"]["props"].get(activity)
        if prop:
            self.pixels(prop, x + 12 * k + 1, top - (k if (int(self.t * 3 + phase) % 2) else 0), k, {c: rgb(v) for c, v in self.PROP_PAL.items()})

    def rest(self, x, bottom, k, cheer, age):
        """The mascot when Claude is not working: asleep, or jumping with a star for a few seconds after it finishes."""
        if cheer:
            self.critter(x, bottom, k, rgb("#d97757"), "cheer", jump=abs(math.sin(age * 7)) * 5 * k * max(0.0, 1 - age / 4))
        else:
            self.critter(x, bottom, k, rgb("#d97757"), sleep=True)

    def confetti(self, x0, y0, x1, y1, age):
        cols = [(217, 119, 87), (245, 197, 66), (126, 211, 127), (255, 143, 177), (106, 167, 255)]
        fade = max(0.0, 1 - max(0.0, age - 3.2))
        wd, ht = int(x1 - x0 - 16), int(y1 - y0)
        for i in range(24):
            fx, fy = x0 + 8 + (i * 47) % wd, y0 + (age * 55 + i * 29) % ht
            c = tuple(int(v * fade) for v in cols[i % 5])
            self.d.rectangle([fx * S, fy * S, (fx + 3) * S - 1, (fy + 3) * S - 1], fill=c)

    def mood(self, x, bottom, pct, color, k):
        """The usage widgets' mascot: asleep with no data, else its mood follows how much of the limit is used (calm / worried / alarmed)."""
        kind = "sleep" if pct is None else "bad" if pct >= 85 else "warn" if pct >= 60 else "good"
        self.buddy(self.look, kind, x, bottom, k, body=color)

    def sparkle(self, cx, cy, c):
        for dx, dy in ((0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)):
            self.d.rectangle([(cx + dx * 2) * S, (cy + dy * 2) * S, (cx + dx * 2 + 2) * S - 1, (cy + dy * 2 + 2) * S - 1], fill=c)

    def w_usage(self, w):
        """Plan limits of one tool. The tool's name comes first, once, in its own colour, so Claude and Codex never get mixed up.
        which="both" (2 x 2 cells): a header, then the 5-hour and weekly limits one above the other, each with its percentage,
        a thin bar and the time to reset. Otherwise one limit: a dial when two rows tall, a slim bar when one."""
        x0, y0, x1, y1 = self.rect(w)
        look = self.look = w.get("mascot") or "pip"
        pc = rgb(w.get("provider_color") or "#b4b4c0")
        name = (w.get("provider") or "").upper()
        rows = w.get("rows") or []
        if w.get("which") == "both" and rows:
            # like the Claude app's own panel, all left-aligned: a title, then rows of label ... detail  percentage over a thin bar
            title = name + ((" · " + w["plan"].upper()) if w.get("plan") else "")
            self.text(x0 + 14, y0 + 8, name, 12, pc, "mono", True, "lm")
            if w.get("plan"):
                self.text(x0 + 14 + self.width(name, 12, "mono", True), y0 + 8, " · " + w["plan"].upper(), 12, col("ink3"), "mono", False, "lm")
            pitch = 27 if len(rows) >= 3 else 38
            known = [r for r in rows if r.get("pct") is not None]
            top_r = max(known, key=lambda r: r["pct"]) if known else None
            self.mood(x1 - 26, y0 + 14, top_r["pct"] if top_r else None, pc if (top_r or {}).get("color") == "provider" else col((top_r or {}).get("color", "good")), 1)
            for i, r in enumerate(rows):
                top = y0 + 19 + i * pitch
                pct = r.get("pct")
                self.text(x0 + 14, top + 6, r["label"], 13, col("ink"), "label", True, "lm")
                shown = "--" if pct is None else f"{pct}%"
                self.text(x1 - 14, top + 6, shown, 13, col("ink") if pct is not None else col("ink3"), "label", True, "rm")
                self.text(x1 - 14 - self.width(shown, 13, "label", True) - 8, top + 6, r.get("sub", ""), 12, col("ink3"), "mono", False, "rm")
                c = pc if r.get("color") == "provider" else col(r.get("color", "good"))
                self.rrect(x0 + 14, top + 16, x1 - 14, top + 20, 2, fill=col("track"))
                if pct:
                    ex = x0 + 14 + max(4, (x1 - x0 - 28) * min(pct, 100) / 100)
                    self.rrect(x0 + 14, top + 16, ex, top + 20, 2, fill=c)
                    self.rrect(ex - 4, top + 16, ex, top + 20, 2, fill=self.mix(c, (255, 255, 255), 0.35 + 0.35 * math.sin(self.t * 4)))   # a lit tip
            return
        pct = w.get("pct")
        color = col(w.get("color", "good"))
        win = " · " + (w.get("caption") or "").upper()
        if w.get("h", 2) == 1:
            self.text(x0 + 14, y0 + 13, name, 12, pc, "mono", True, "lm")
            self.text(x0 + 14 + self.width(name, 12, "mono", True), y0 + 13, win, 12, col("ink3"), "mono", False, "lm")
            self.text(x0 + 14, y0 + 35, "--" if pct is None else f"{pct}%", 22, col("ink") if pct is not None else col("ink3"), "label", True, "lm")
            bx0, bx1 = x0 + 78, x1 - 14
            self.mood(x1 - 26, y0 + 18, pct, color, 1)
            self.rrect(bx0, y0 + 32, bx1, y0 + 38, 3, fill=col("track"))
            if pct:
                ex = bx0 + max(6, (bx1 - bx0) * pct / 100)
                self.rrect(bx0, y0 + 32, ex, y0 + 38, 3, fill=color)
                self.rrect(ex - 5, y0 + 32, ex, y0 + 38, 3, fill=self.mix(color, (255, 255, 255), 0.35 + 0.35 * math.sin(self.t * 4)))
            return
        cx, cy, r, th = x0 + 14 + 34, y0 + 50, 30, 8
        bb = [(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S]
        self.d.arc(bb, 0, 360, fill=col("track"), width=th * S)
        if pct:
            self.d.arc(bb, -90, -90 + 360 * pct / 100, fill=color, width=th * S)
            a = math.radians(-90 + 360 * pct / 100)   # a lit dot at the end of the arc
            gx, gy, gl = cx + r * math.cos(a), cy + r * math.sin(a), self.mix(color, (255, 255, 255), 0.4 + 0.4 * math.sin(self.t * 4))
            self.d.ellipse([(gx - 4) * S, (gy - 4) * S, (gx + 4) * S, (gy + 4) * S], fill=gl)
        self.mood(x1 - 14 - 24, y0 + 60, pct, color, 2)
        tx = cx + r + 20
        self.text(tx, y0 + 22, name, 13, pc, "mono", True, "lm")
        self.text(tx + self.width(name, 13, "mono", True), y0 + 22, win, 13, col("ink3"), "mono", False, "lm")
        self.text(tx, y0 + 52, "--" if pct is None else f"{pct}%", 34, col("ink") if pct is not None else col("ink3"), "label", True, "lm")
        if w.get("sub"):
            self.text(tx, y0 + 80, w["sub"], 13, col("ink3"), "mono", False, "lm")

    def w_wave(self, w):
        tt = self.t * 0.4
        for i in range(48):
            h = 20 + 30 * (math.sin(tt + i * 0.3) + 1) + 14 * (math.sin(tt * 1.7 + i * 0.11) + 1)
            r, g, b = [int(c * 255) for c in colorsys.hsv_to_rgb(((i / 48) + tt * 0.05) % 1, 0.7, 1)]
            self.rrect(12 + i * 19.5, 80 - h / 2, 24 + i * 19.5, 80 + h / 2, 5, fill=(r, g, b))

    # --- now playing: track info and progress (the player widget: 4 x 2 on a half, or a compact 2 x 2) ---
    # The player has its own colours (from the artwork), never the profile's: tint, and tint2 a little way round the colour wheel.
    def w_now_playing(self, w):
        idle = w.get("idle", "")
        x0 = w.get("col", 0) * G["col_w"]
        x1 = x0 + w.get("w", 4) * G["col_w"]
        compact = w.get("w", 4) < 4
        tint, tint2 = rgb(w.get("tint") or "#3d8bff"), rgb(w.get("tint2") or "#1fd1c4")
        art = ART_LOOKUP(w.get("art")) if w.get("art") else None
        brand = rgb(w["brand"]) if w.get("brand") else None
        # the player's own interface (meter, progress bar) uses the source's colour (Spotify green...), a touch lighter at the far end
        ui1, ui2 = (brand, self.mix(brand, (255, 255, 255), 0.28)) if brand else (tint, tint2)
        self.np_volume(w.get("volume"), x1, ui1, ui1, w.get("vol_glow"))
        if idle == "empty":
            cx = (x0 + x1) / 2
            self.icon("music", cx, 50, 30, col("ink3"), 2)
            self.text(cx, 86, "Nothing playing", 16 if compact else 22, col("ink2"))
            if not compact:
                self.text(cx, 110, w.get("hint", "Play something in Spotify or Chrome"), 13, col("ink3"), "mono", False)
            return
        self.np_info(w, compact, x0, x1, art, ui1, ui2)

    def w_browse(self, w):
        """Column view in one half of the display: each column up to five rows, the selected row on a soft tint of the player's colour
        (brighter in the column that has the focus). A faint line separates the list from the player."""
        tint, tint2 = rgb(w.get("tint") or "#3d8bff"), rgb(w.get("tint2") or "#1fd1c4")
        x0, x1 = w.get("x0", 0), w.get("x1", 960)
        cols = w.get("cols") or []
        cw = (x1 - x0) / max(1, len(cols))
        y0, rh = 30, 20
        accent = self.mix(tint, tint2, 0.5)
        edge = x1 if x0 == 0 else x0                       # the side that faces the player
        self.d.rectangle([(edge - 0.5) * S, 34 * S, (edge + 0.5) * S, 126 * S], fill=tuple(int(c * 0.5) for c in col("ink4")))
        for ci, c in enumerate(cols):
            cx0, cx1 = x0 + ci * cw, x0 + (ci + 1) * cw
            rows = c.get("rows") or []
            if not rows:
                self.text((cx0 + cx1) / 2, 80, self.clip(c.get("empty") or "", 13, cw - 24), 13, col("ink3"))
                continue
            k = 1.0 if c.get("focus") else 0.5
            for i, r in enumerate(rows):
                cy = y0 + i * rh + rh / 2
                if r.get("on"):
                    self.rrect(cx0 + 8, cy - rh / 2 + 1, cx1 - 8, cy + rh / 2 - 1, 2, fill=tuple(int(ch * 0.30 * k) for ch in accent))
                    self.rrect(cx0 + 8, cy - rh / 2 + 3, cx0 + 11, cy + rh / 2 - 3, 1, fill=tuple(int(ch * k) for ch in accent))
                ink = col("ink") if r.get("on") and c.get("focus") else col("ink2")
                self.row_text(cx0 + 22, cy, r.get("text", ""), 14, cw - 44, ink, bool(r.get("on")) and bool(c.get("focus")), r.get("scroll"))
            if c.get("above"):
                self.icon("arrowup", cx1 - 14, y0 + 6, 10, col("ink3"), 1.4)
            if c.get("more"):
                self.icon("arrowdown", cx1 - 14, y0 + 5 * rh - 6, 10, col("ink3"), 1.4)

    def row_text(self, x, cy, s, size, maxw, ink, bold, scroll):
        """A list row. Too long: '...'. Once the selection has rested 3 s (scroll = seconds since), the name slides left to show the end,
        holds, then snaps back and rests again."""
        tw = self.width(s, size)
        if scroll is None or tw <= maxw:
            self.text(x, cy, self.clip(s, size, maxw), size, ink, "label", bold, "lm")
            return
        over = tw - maxw
        dur = over / 45.0
        ph = scroll % (dur + 1.5 + 3.0)
        off = over * min(1.0, ph / dur) if ph < dur + 1.5 else 0.0
        box = (int(x * S), int((cy - 10) * S), int((x + maxw) * S), int((cy + 10) * S))
        tile = self.img.crop(box)
        ImageDraw.Draw(tile).text((-off * S, 10 * S), s, font=base.font(int(size * S), bold, "label"), fill=ink, anchor="lm")
        self.img.paste(tile, box[:2])

    def np_volume(self, vol, x1, tint, tint2, glow=False):
        """A slim volume meter on the display's right edge, always there while the player is up (Encoder 8 is the volume knob)."""
        if vol is None:
            return
        cx, top, bot = x1 - 20, 66, 106  # inside the player: it moves with it
        ink = col("ink") if glow else col("ink3")
        self.icon("mute" if vol == 0 else "volume", cx, 52, 14, ink, 1.6)
        # while the knob turns the bar is a little wider and the numbers brighter
        wd = 4 if glow else 3
        self.rrect(cx - wd, top, cx + wd, bot, wd, fill=col("track"))
        h = max(3.0, (bot - top) * max(0, min(100, vol)) / 100.0)
        self.rrect(cx - wd, bot - h, cx + wd, bot, wd, fill=self.mix(tint2, tint, vol / 100.0))
        self.text(cx, 116, str(int(vol)), 12 if glow else 11, ink, "mono", glow)

    @staticmethod
    def mix(a, b, t):
        return tuple(int(a[i] + (b[i] - a[i]) * max(0.0, min(1.0, t))) for i in range(3))

    def np_info(self, w, compact, x0, x1, art, tint, tint2):
        ui_accent = tint
        title, artist = w.get("title", ""), w.get("artist", "")
        prog = max(0.0, min(1.0, w.get("progress", 0)))
        if compact:   # 2 x 2: artwork left, title and artist beside it, the bar and times under both
            ax, ay, asz = x0 + 12, 40, 64
            tx = ax + asz + 12
            tw = x1 - 12 - tx
            tsize, asize, ty, ay2, by, bs, rdy = 17, 12, 56, 19, 114, 16, 13
        else:
            ax, ay, asz = x0 + 14, 40, 80
            tx = ax + asz + 16
            tw = x1 - 44 - tx  # title and bar run nearly to the right edge; the volume meter sits in the last 40 px
            tsize, asize, ty, ay2, by, bs, rdy = 22, 14, 62, 24, 106, 22, 15
        g = float(w.get("glyph") or 0)  # paused: dimmed artwork with a pause glyph; just resumed: a play glyph that fades out
        if art is not None and w.get("art"):
            im = art.resize((asz * S, asz * S), Image.LANCZOS)
            if g > 0:
                im = ImageEnhance.Brightness(im).enhance(1 - 0.55 * g)
            mask = Image.new("L", im.size, 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=8 * S, fill=255)
            self.img.paste(im, (ax * S, ay * S), mask)
        else:
            self.rrect(ax, ay, ax + asz, ay + asz, 8, fill=col("track"))
        if g > 0:
            gk = int(255 * g)
            self.icon(w.get("glyph_icon") or "pause", ax + asz / 2, ay + asz / 2, asz * 0.38, (gk, gk, gk), 2.4)
        src = ICON_LOOKUP(w.get("src_icon")) if w.get("src_icon") else None
        if src is not None:  # which app this is playing in, as a small badge on the artwork's corner
            bx, by0 = ax + asz - bs + 6, ay + asz - bs + 6
            self.rrect(bx - 2, by0 - 2, bx + bs + 2, by0 + bs + 2, 7, fill=(0, 0, 0))
            ic = src.resize((bs * S, bs * S), Image.LANCZOS)
            self.img.paste(ic, (int(bx * S), int(by0 * S)), ic)
        lx = 0
        if w.get("liked"):  # already saved / liked: a filled heart in the source's colour before the title
            lx = tsize * 0.8 + 8
            self.icon(w.get("like_icon") or "heartfill", tx + tsize * 0.4, ty, tsize * 0.8, ui_accent)
        self.text(tx + lx, ty, self.clip(title or "Unknown", tsize, tw - lx), tsize, col("ink"), "label", True, "lm")
        if artist:
            self.text(tx, ty + ay2, self.clip(artist, asize, tw), asize, col("ink2"), "label", False, "lm")
        if compact:   # the bar and times run under the artwork too, the full width of the card
            tx, tw = ax, x1 - 12 - ax
        bx1 = tx + tw
        seeking = bool(w.get("seeking"))
        hh = 3.5 if seeking else 2.5
        kd = 1.0 if w.get("playing") or w.get("idle") else 0.55  # paused: the bar dims with the artwork
        self.rrect(tx, by - hh, bx1, by + hh, hh, fill=col("track"))
        fx = tx + max(4, (bx1 - tx) * prog) if prog > 0 else tx
        if prog > 0:
            for gx in range(int(tx), int(fx), 3):  # the progress bar fades from the first colour to the second
                c = self.mix(tint, tint2, (gx - tx) / max(1, bx1 - tx))
                self.d.rectangle([gx * S, (by - hh + 0.5) * S, min(gx + 3, fx) * S, (by + hh - 0.5) * S], fill=tuple(int(v * kd) for v in c))
        if seeking:  # the playhead while a finger is on the touch strip
            self.d.ellipse([(fx - 6) * S, (by - 6) * S, (fx + 6) * S, (by + 6) * S], fill=col("ink"))
        if w.get("elapsed"):  # elapsed on the left under the bar, total on the right
            ry = by + rdy
            if seeking:
                lx2 = max(tx + 16, min(bx1 - 16, fx))
                self.text(lx2, ry, w["elapsed"], 13, col("ink"), "mono", True, "mm")
                if lx2 + 26 < bx1 - self.width(w.get("total", ""), 12, "mono", False):
                    self.text(bx1, ry, w.get("total", ""), 12, col("ink3"), "mono", False, "rm")
            else:
                self.text(tx, ry, w["elapsed"], 12, col("ink2"), "mono", False, "lm")
                self.text(bx1, ry, w.get("total", ""), 12, col("ink3"), "mono", False, "rm")

    def clip(self, s, size, maxw):
        if self.width(s, size) <= maxw:
            return s
        while len(s) > 1 and self.width(s + "...", size) > maxw:
            s = s[:-1]
        return s.rstrip() + "..."

    def w_rainbow(self, w):
        for x in range(0, W, 2):
            r, g, b = [int(c * 255) for c in colorsys.hsv_to_rgb(((x / W) + self.t * 0.3) % 1, 1, 1)]
            self.d.rectangle([x * S, 0, (x + 2) * S, H * S], fill=(r, g, b))
        self.text(W / 2, 80, w.get("text", "PUSH 2 ONLINE"), 52, (0, 0, 0))

    def pill(self):
        """Every short message (Saved, Shuffle on, a knob's value) is this one shape: the picture behind goes soft and dark, a rounded pill
        with an icon and a few words in the middle, and for a knob a slim bar of its value. spec['pill'] = {text, icon, value, vtext, a}."""
        pl = self.spec.get("pill")
        if not pl:
            return
        from PIL import ImageFilter
        orig = self.img.copy()
        small = self.img.reduce(4).filter(ImageFilter.GaussianBlur(2.5)).resize(self.img.size, Image.BILINEAR).point(lambda v: int(v * 0.45))
        self.img.paste(small)
        size = 17
        tw = self.width(pl["text"], size, "label", True)
        icon_w = 22 + 10 if pl.get("icon") else 0
        has_v = pl.get("value") is not None
        vw = self.width(pl.get("vtext", ""), size, "label", True) + 24 if has_v else 0
        w, h = max(300 if has_v else 0, tw + icon_w + vw + 40), (54 if has_v else 38)
        x0, y0 = 480 - w / 2, 80 - h / 2
        cy = y0 + (19 if has_v else h / 2)
        self.rrect(x0, y0, x0 + w, y0 + h, 19 if has_v else h / 2, fill=(24, 24, 24), outline=col("ink4"), width=1)
        if pl.get("icon"):
            self.icon(pl["icon"], x0 + 20 + 11, cy, 18, col("ink"))
        self.text(x0 + 20 + icon_w, cy, pl["text"], size, col("ink"), "label", True, "lm")
        if has_v:
            self.text(x0 + w - 22, cy, pl.get("vtext", ""), size, col("ink"), "label", True, "rm")
            bx0, bx1, by = x0 + 22, x0 + w - 22, y0 + 39
            self.rrect(bx0, by, bx1, by + 5, 2.5, fill=col("track"))
            self.rrect(bx0, by, bx0 + max(5, (bx1 - bx0) * max(0, min(100, pl["value"])) / 100), by + 5, 2.5, fill=col("ink"))
        a = pl.get("a", 1)
        if a < 1:  # fading in or out
            self.img.paste(Image.blend(orig, self.img, max(0.0, a)))


def mixc_(c, k):
    """A colour at strength k over black: the dark tile behind a site's letter."""
    return tuple(int(v * k) for v in c)


def wipe(a, b, p):
    """A view change: the new picture arrives from the left behind a soft edge (p runs 0 to 1, eased here)."""
    p = p * p * (3 - 2 * p)
    edge = 320
    k = np.clip((p * (W + edge) - np.arange(W)) / edge, 0, 1)
    A, B = np.asarray(a.convert("RGB"), np.float32), np.asarray(b.convert("RGB"), np.float32)
    return Image.fromarray((A + (B - A) * k[None, :, None]).astype(np.uint8))


def slide(old, new, p, side, entering):
    """The large player's half slides in from (or back out to) the display's edge on its side. In: the new picture's half moves over the old one
    (ease-out); out: the old picture's half moves away over the new one (ease-in). Its button labels travel with it."""
    p = 1 - (1 - p) ** 3 if entering else p ** 2
    half = W // 2
    base, mover = (old, new) if entering else (new, old)
    out = base.convert("RGB").copy()
    vis = int(round(half * (p if entering else 1 - p)))   # how much of the half is on screen
    if vis > 0:
        x0 = 0 if side == "left" else half
        src = mover.convert("RGB").crop((x0, 0, x0 + half, H))
        piece = src.crop((half - vis, 0, half, H)) if side == "left" else src.crop((0, 0, vis, H))   # the end that leads the slide
        out.paste(piece, (0 if side == "left" else W - vis, 0))
    return out


def _fps(spec, t):
    """How often the picture must be redrawn for its moving parts: the busy Claude widget and the visualizers 15 a second, the slow ones
    (sleeping mascot, usage and clock critters) 4, a still display 0 (the picture is then cached)."""
    r = 0
    for w in spec.get("widgets", []):
        k = w["type"]
        if k in ("wave", "rainbow"):
            r = max(r, 15)
        elif k == "claude_session":
            st = w.get("state")
            r = max(r, 30 if st == "working" or (w.get("done_at") and t - w["done_at"] < 4.3) else 10 if st == "idle" else 0)
        elif k in ("usage", "clock"):
            r = max(r, 15 if (w.get("timer") or {}).get("tenths") else 8)
        elif k in ("browser", "download") and (w.get("pop") or w.get("loading") or (w.get("dl") or {}).get("active")):
            r = max(r, 30 if w.get("pop") else 15)
        elif k == "ask" and w.get("mode") == "dictate" or k in ("ask_banner", "limit"):
            r = max(r, 15)
        elif k == "orb":
            r = max(r, 20)
    return r


def draw(spec, t=None):
    t = time.time() if t is None else t
    fps = _fps(spec, t)
    key = json.dumps(spec, sort_keys=True) + (str(int(t * fps)) if fps else "")
    if _cache["key"] == key:
        return _cache["img"]
    p = Painter(spec, t)
    for w in spec.get("widgets", []):
        p.widget(w)
    if not spec.get("no_zones"):
        p.zones()
    p.pill()
    # Lanczos is crisper but ~10 ms; the visualizer redraws 30x a second, so it uses the much cheaper box filter
    img = p.img.reduce(S) if (fps or any(w["type"] == "now_playing" for w in spec.get("widgets", []))) else p.img.resize((W, H), Image.LANCZOS)   # moving pictures use the cheaper box filter
    _cache.update(key=key, img=img)
    return img

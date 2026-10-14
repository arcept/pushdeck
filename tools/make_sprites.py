"""Draws the Claude session widget's mascot sprite sheets (two looks x 15 roles x 10 frames) with Pillow.
Run:  .venv/bin/python tools/make_sprites.py      (writes display/assets/mascot_<look>.png + mascots.json and copies them to ui/src/display/)
Frames 0-7 are one walking loop, 8-9 blink; "sleep" is a 10-frame breathing loop. Units: 56 x 56 per cell, drawn at 2 px per unit; feet on y = 52, centre x = 22."""
import json, math, shutil, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from sprite_vec import Canvas, mix
from PIL import Image, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[1]
UNITS, PX, FRAMES = 56, 2, 10
PIXEL = 0.5          # the pixel set is drawn at half a pixel per unit (a 28 px cell) and shown at whole multiples, so its pixels stay square
KINDS = ["reader", "builder", "runner", "planner", "thinker", "plain", "timer", "good", "warn", "bad", "crew1", "crew2", "crew3", "sleep", "done"]
PAL = {  # body light, body dark
    "reader": ((96, 165, 255), (30, 80, 230)), "builder": ((255, 176, 70), (240, 98, 30)), "runner": ((192, 132, 255), (120, 50, 220)),
    "planner": ((70, 230, 200), (10, 150, 150)), "thinker": ((255, 130, 200), (220, 50, 140)), "plain": ((255, 150, 110), (217, 90, 55)),
    "timer": ((255, 150, 110), (217, 90, 55)), "good": ((120, 240, 130), (30, 170, 70)), "warn": ((255, 215, 90), (240, 150, 20)),
    "bad": ((255, 120, 110), (225, 40, 55)), "crew1": ((120, 215, 255), (30, 130, 235)), "crew2": ((190, 240, 100), (80, 180, 40)),
    "crew3": ((220, 160, 255), (150, 70, 230)), "sleep": ((150, 160, 215), (85, 95, 160)), "done": ((120, 240, 130), (30, 170, 70)),
}
HEAD = {"crew1": (255, 120, 150), "crew2": (255, 190, 60), "crew3": (90, 220, 220)}   # headband colours of the crew


def costume(cv, kind, k, X, Y, hx, hy, bob, ey, phase, lt, dk):
    """Hat / prop of each role (shared by every species; the head sits where the body is)."""
    if kind == "reader":
        cv.poly([(X(9), Y(11 + bob)), (X(14), Y(3 + bob)), (X(26), Y(3 + bob)), (X(31), Y(11 + bob))], (150, 98, 52), (105, 64, 30))
        cv.e(X(20), Y(9 + bob), 12 * k, 3.4 * k, (120, 76, 38), (86, 52, 24))
        cv.poly([(X(6), Y(11.5 + bob)), (X(20), Y(9 + bob)), (X(34), Y(11.5 + bob)), (X(33), Y(14 + bob)), (X(7), Y(14 + bob))], (88, 54, 26), (60, 36, 16))
        cv.line([(X(20), Y(3.4 + bob)), (X(20), Y(9 + bob))], 0.8 * k, (70, 40, 20), 0.6)
        cv.line([(hx + 0.5 * k, hy + 1 * k), (hx + 6 * k, hy + 8 * k)], 1.8 * k, (120, 80, 40))
        cv.e(hx + 3.2 * k, hy - 3.2 * k, 6.2 * k, 6.2 * k, (240, 240, 255))
        cv.e(hx + 3.2 * k, hy - 3.2 * k, 4.9 * k, 4.9 * k, (150, 215, 255), (90, 160, 235))
        cv.e(hx + 1.6 * k, hy - 4.8 * k, 1.4 * k, 1 * k, (255, 255, 255), None, 0.8)
    elif kind == "builder":
        cv.fill(lambda d: d.pieslice([X(8) * cv.SS, Y(1.5 + bob) * cv.SS, X(32) * cv.SS, Y(22 + bob) * cv.SS], 180, 360, fill=255), (255, 214, 60), (245, 160, 10))
        cv.r(X(5), Y(10 + bob), X(35), Y(13.5 + bob), 1.6 * k, (255, 196, 40), (230, 140, 10))
        cv.r(X(17.5), Y(2.8 + bob), X(22.5), Y(10 + bob), 1.2 * k, (255, 236, 140), (255, 200, 50))
        sw = math.sin(phase) * 0.6
        cv.line([(hx, hy + 2 * k), (hx + (4 + sw) * k, hy - 6 * k)], 1.8 * k, (150, 100, 55))
        cv.r(hx + (0.5 + sw) * k, hy - 10.5 * k, hx + (8.5 + sw) * k, hy - 5.5 * k, 1.1 * k, (210, 215, 225), (120, 126, 140))
    elif kind == "runner":
        cv.e(X(20), Y(17 + bob), 16.5 * k, 17 * k, (190, 230, 255), None, 0.20)
        cv.arc(X(20), Y(17 + bob), 16.5 * k, 17 * k, 200, 330, 1.3 * k, (255, 255, 255), 0.8)
        cv.e(X(12), Y(7.5 + bob), 2.2 * k, 1.2 * k, (255, 255, 255), None, 0.6)
        cv.line([(X(20), Y(1 + bob)), (X(20), Y(-3 + bob))], 0.9 * k, (210, 210, 230))
        cv.e(X(20), Y(-4 + bob), 1.9 * k, 1.9 * k, (255, 90, 120), (220, 20, 70))
        cv.r(hx - 1 * k, hy - 7 * k, hx + 11 * k, hy + 2 * k, 1.4 * k, (30, 30, 52), (12, 12, 28))
        cv.r(hx - 0.2 * k, hy - 6.2 * k, hx + 10.2 * k, hy + 1.2 * k, 1 * k, (10, 26, 24))
        cv.line([(hx + 1.5 * k, hy - 4.8 * k), (hx + 3.3 * k, hy - 3.4 * k), (hx + 1.5 * k, hy - 2 * k)], 0.8 * k, (90, 255, 160))
        cv.line([(hx + 4.5 * k, hy - 1 * k), (hx + (6 + math.sin(phase * 2) * 1.5) * k, hy - 1 * k)], 0.8 * k, (90, 255, 160))
    elif kind == "planner":
        for cx in (14.5, 25.5):
            cv.arc(X(cx), ey, 5 * k, 5.4 * k, 0, 360, 1 * k, (40, 40, 70))
        cv.line([(X(19.5), ey), (X(20.5), ey)], 0.9 * k, (40, 40, 70))
        cv.e(X(20), Y(7 + bob), 12 * k, 5.2 * k, (255, 100, 110), (210, 40, 70))
        cv.e(X(20), Y(2.4 + bob), 1.3 * k, 1.3 * k, (210, 40, 70))
        cv.r(hx - 0.5 * k, hy - 8 * k, hx + 9.5 * k, hy + 4 * k, 1.3 * k, (190, 130, 70), (140, 90, 40))
        cv.r(hx + 0.6 * k, hy - 6.6 * k, hx + 8.4 * k, hy + 2.8 * k, 0.8 * k, (250, 250, 255))
        cv.r(hx + 2.6 * k, hy - 9 * k, hx + 6.4 * k, hy - 7 * k, 0.6 * k, (190, 195, 210))
        for i, c in enumerate(((60, 200, 120), (60, 200, 120), (200, 205, 220))):
            pts = [(hx + 1.7 * k, hy - 4.6 * k + i * 2.3 * k), (hx + 2.6 * k, hy - 3.9 * k + i * 2.3 * k), (hx + 3.8 * k, hy - 5.4 * k + i * 2.3 * k)] if i < 2 else [(hx + 1.8 * k, hy - 4.4 * k + i * 2.3 * k), (hx + 3.6 * k, hy - 4.4 * k + i * 2.3 * k)]
            cv.line(pts, 0.6 * k, c)
            cv.line([(hx + 4.8 * k, hy - 4.4 * k + i * 2.3 * k), (hx + 7.6 * k, hy - 4.4 * k + i * 2.3 * k)], 0.6 * k, (190, 195, 215))
    elif kind == "thinker":
        gl = 0.5 + 0.5 * math.sin(phase)
        cv.glow(lambda d: d.ellipse([X(14) * cv.SS, Y(-9 + bob) * cv.SS, X(26) * cv.SS, Y(3 + bob) * cv.SS], fill=255), (255, 230, 90), rad=7 * k, strength=0.45 + 0.4 * gl)
        cv.e(X(20), Y(-3.5 + bob), 5.8 * k, 6 * k, (255, 244, 150), (255, 196, 40))
        cv.r(X(17.4), Y(1 + bob), X(22.6), Y(4.4 + bob), 1 * k, (190, 190, 205), (130, 132, 150))
        cv.line([(X(18), Y(-2 + bob)), (X(19.4), Y(-4 + bob)), (X(20.6), Y(-2 + bob)), (X(22), Y(-4 + bob))], 0.6 * k, (210, 130, 20))
        cv.e(X(35.5), Y(14 + bob), 1.6 * k, 1.6 * k, (255, 255, 255), None, 0.6)
        cv.e(X(38), Y(9 + bob), 1.1 * k, 1.1 * k, (255, 255, 255), None, 0.5)
    elif kind == "timer":
        cv.r(hx - 0.5 * k, hy - 9 * k, hx + 8.5 * k, hy - 7.6 * k, 0.6 * k, (150, 110, 70))
        cv.r(hx - 0.5 * k, hy + 1.4 * k, hx + 8.5 * k, hy + 2.8 * k, 0.6 * k, (150, 110, 70))
        cv.poly([(hx + 0.3 * k, hy - 7.6 * k), (hx + 7.7 * k, hy - 7.6 * k), (hx + 4 * k, hy - 3.2 * k)], (190, 235, 255), (140, 200, 245), 0.9)
        cv.poly([(hx + 0.3 * k, hy + 1.4 * k), (hx + 7.7 * k, hy + 1.4 * k), (hx + 4 * k, hy - 3 * k)], (190, 235, 255), (140, 200, 245), 0.9)
        cv.poly([(hx + 2 * k, hy + 1.4 * k), (hx + 6 * k, hy + 1.4 * k), (hx + 4 * k, hy - 1.2 * k)], (255, 210, 70), (240, 160, 20))
    elif kind == "sleep":
        cv.poly([(X(9), Y(10 + bob)), (X(22), Y(-2 + bob)), (X(33), Y(14 + bob))], (90, 110, 230), (50, 60, 170))
        cv.r(X(7), Y(9 + bob), X(34), Y(13 + bob), 2 * k, (235, 240, 255), (180, 190, 230))
        cv.e(X(23), Y(-3 + bob), 2.2 * k, 2.2 * k, (255, 255, 255))
    elif kind == "done":
        cv.poly([(X(14), Y(5 + bob)), (X(14), Y(-2 + bob)), (X(17), Y(2 + bob)), (X(20), Y(-4 + bob)), (X(23), Y(2 + bob)), (X(26), Y(-2 + bob)), (X(26), Y(5 + bob))], (255, 214, 60), (240, 150, 10))
        cv.e(X(20), Y(-4 + bob), 1.2 * k, 1.2 * k, (255, 255, 255))
    elif kind == "bad":
        cv.e(X(31.5), Y(10 + bob), 1.6 * k, 2.4 * k, (150, 215, 255), (90, 170, 245))   # a sweat drop
    elif kind in HEAD:
        cv.r(X(7), Y(9 + bob), X(33), Y(12.4 + bob), 1.4 * k, HEAD[kind], mix(HEAD[kind], (0, 0, 0), 0.25))
        cv.poly([(X(31), Y(10 + bob)), (X(37), Y(8 + bob)), (X(35.5), Y(12 + bob))], HEAD[kind])


def round_body(cv, kind, k, X, Y, bob, step, lt, dk, blink, phase):
    """Pip: a plump glossy critter."""
    cv.fill(lambda d: d.ellipse([X(9) * cv.SS, Y(37.3) * cv.SS, X(31) * cv.SS, Y(40) * cv.SS], fill=255), (0, 0, 0), None, 0.45)
    for sx, ph in ((13, 1), (27, -1)):
        lift = max(0, step * ph) * 1.6 if kind != "sleep" else 0
        cv.e(X(sx), Y(36 - lift), 5 * k, 2.8 * k, mix(dk, (0, 0, 0), 0.25), mix(dk, (0, 0, 0), 0.5))
    aw = step * 1.2 if kind != "sleep" else 0
    cv.e(X(6.5), Y(24 + aw + bob), 3.2 * k, 2.7 * k, lt, dk)
    cv.e(X(20), Y(22 + bob), 13.5 * k, 14 * k, lt, dk)
    cv.fill(lambda d: d.ellipse([X(9) * cv.SS, Y(10 + bob) * cv.SS, X(23) * cv.SS, Y(17 + bob) * cv.SS], fill=255), (255, 255, 255), None, 0.30)
    cv.e(X(20), Y(30 + bob), 8 * k, 4 * k, mix(lt, (255, 255, 255), 0.45), None, 0.28)
    cv.e(X(10.5), Y(25 + bob), 2.6 * k, 1.7 * k, (255, 110, 140), None, 0.55)
    cv.e(X(29.5), Y(25 + bob), 2.6 * k, 1.7 * k, (255, 110, 140), None, 0.55)
    ey = Y(20 + bob)
    if cv.SS == 1 and k < 1:                                  # the pixel set: eyes placed pixel by pixel so they stay readable
        for cx in (14.5, 25.5):
            ex, eyy = round(X(cx) - 1), round(ey - 1.5)
            if kind == "sleep" or blink:
                cv.r(ex, eyy + 2, ex + 2, eyy + 3, 0, (30, 20, 50))
            else:
                cv.r(ex, eyy, ex + 2, eyy + 3, 0, (255, 255, 255))
                cv.r(ex + 1, eyy + 1, ex + 2, eyy + 3, 0, (35, 25, 70))
        for cx in (10.5, 29.5):
            cv.r(round(X(cx)) - 1, round(Y(25 + bob)), round(X(cx)) + 1, round(Y(25 + bob)) + 1, 0, (255, 120, 150))
        return ey
    if kind == "sleep" or blink:
        cv.arc(X(14.5), ey, 3.2 * k, 2.2 * k, 10, 170, 1.2 * k, (30, 20, 50))
        cv.arc(X(25.5), ey, 3.2 * k, 2.2 * k, 10, 170, 1.2 * k, (30, 20, 50))
    else:
        for cx in (14.5, 25.5):
            cv.e(X(cx), ey, 3.7 * k, 4.6 * k, (255, 255, 255))
            cv.e(X(cx + 0.6), ey + 0.6 * k, 2.2 * k, 3 * k, (35, 25, 70), (70, 50, 130))
            cv.e(X(cx + 1.3), ey - 0.7 * k, 0.9 * k, 0.9 * k, (255, 255, 255))
    if kind in ("done", "good"):
        cv.arc(X(20), Y(25.5 + bob), 3 * k, 2.5 * k, 20, 160, 1.1 * k, (60, 20, 40))
    elif kind == "bad":
        cv.arc(X(20), Y(28 + bob), 2.4 * k, 1.6 * k, 200, 340, 1.0 * k, (60, 20, 40))
    elif kind != "sleep":
        cv.arc(X(20), Y(25 + bob), 2.2 * k, 1.6 * k, 20, 160, 1.0 * k, (60, 20, 40))
    return ey


def frame(species, kind, f, pixel=False):
    ss = 1 if pixel else 5
    k = PIXEL if pixel else PX                   # px per unit
    cell = round(UNITS * k)
    cv = Canvas(cell, cell, (0, 0, 0, 0), ss=ss, mode="RGBA")
    ox, oy = 2 * k, 14 * k                       # puts the body's centre at x = 22 and its feet on y = 52 (units)
    X = lambda x: ox + x * k
    Y = lambda y: oy + y * k
    walking = kind != "sleep"
    blink = f >= 8
    phase = (f if f < 8 else (0 if f == 8 else 4)) / 8 * 2 * math.pi
    if kind == "sleep":
        phase = f / FRAMES * 2 * math.pi
        bob, step = math.sin(phase) * 0.7, 0.0
    else:
        bob, step = math.cos(phase * 2) * 0.8, math.sin(phase)
    lt, dk = PAL[kind]
    ey = round_body(cv, kind, k, X, Y, bob, step, lt, dk, blink, phase)
    ra = -step * 1.2 if walking else 0
    hx, hy = X(33.5), Y(24 + ra + bob)
    costume(cv, kind, k, X, Y, hx, hy, bob, ey, phase, lt, dk)
    cv.e(hx, hy + (1 * k if kind in ("reader", "builder", "runner", "planner", "timer") else 0), 3.2 * k, 2.7 * k, lt, dk)
    im = cv.im.resize((cell, cell), Image.LANCZOS) if ss > 1 else cv.im
    if pixel:                      # chunky retro look: coarse colours, a dark outline, hard alpha
        r, g, b, a = im.split()
        a = a.point(lambda v: 255 if v > 100 else 0)
        rgb = Image.merge("RGB", (r, g, b)).point(lambda v: (v // 32) * 32 + 16)
        edge = ImageChops.subtract(a.filter(ImageFilter.MaxFilter(3)), a)
        rgb.paste((24, 16, 36), mask=edge)
        im = Image.merge("RGBA", (*rgb.split(), ImageChops.lighter(a, edge)))
    return im


def sheet(species, pixel):
    cell = round(UNITS * (PIXEL if pixel else PX))
    out = Image.new("RGBA", (FRAMES * cell, len(KINDS) * cell), (0, 0, 0, 0))
    for r, kind in enumerate(KINDS):
        for f in range(FRAMES):
            out.paste(frame(species, kind, f, pixel), (f * cell, r * cell))
        print(species, "pixel" if pixel else "", kind, file=sys.stderr)
    return out


if __name__ == "__main__":
    dest = ROOT / "daemon" / "push_daemon" / "display" / "assets"
    dest.mkdir(parents=True, exist_ok=True)
    only = sys.argv[1:] or ["pip", "pixel"]
    for name in only:
        sheet("pip", name == "pixel").save(dest / f"mascot_{name}.png", optimize=True)
        shutil.copy(dest / f"mascot_{name}.png", ROOT / "ui" / "src" / "display" / f"mascot_{name}.png")
    meta = {"units": UNITS, "px": PX, "frames": FRAMES, "kinds": KINDS, "foot": 52, "cx": 22, "scale": {"pip": PX, "pixel": PIXEL}}
    (dest / "mascots.json").write_text(json.dumps(meta))
    shutil.copy(dest / "mascots.json", ROOT / "ui" / "src" / "display" / "mascots.json")

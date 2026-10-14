"""Hardware tests. Every test is rerunnable from the Repeat button (btn-repeat).

A test is `fn(ctx) -> (ok: bool, summary: str)`. The runner remembers the last test and its args.
"""
import asyncio
import colorsys

import numpy as np
from PIL import Image, ImageDraw

from . import registry as R
from . import scenes
from .display import render

TESTS = {}
# What the UI lists under Settings > Tests. group: "Hardware" | "Colour". Add an entry here when adding a test.
TESTS_META = {
    "rainbow": {"title": "Connection check and rainbow", "group": "Hardware", "interactive": False,
                "description": "Confirms USB and MIDI, then lights every pad, button and strip LED and sweeps the display."},
    "knob_sensitivity": {"title": "Knob sensitivity", "group": "Hardware", "interactive": True,
                         "description": "Turn Encoder 8 one slow full rotation, then press Select. Sets how far each tick moves a value."},
    "cal_red": {"title": "Red", "group": "Colour", "interactive": True,
                "description": "Ten reds. Press the button under the one that looks most red."},
    "cal_green": {"title": "Green", "group": "Colour", "interactive": True,
                  "description": "Ten greens. Press the button under the one that looks most green."},
    "cal_blue": {"title": "Blue", "group": "Colour", "interactive": True,
                 "description": "Ten blues. Press the button under the one that looks most blue."},
    "cal_saturation": {"title": "Saturation", "group": "Colour", "interactive": True,
                       "description": "A sample palette at ten strengths. Pick the richest that still looks good."},
    "cal_all": {"title": "Guided: all colours", "group": "Colour", "interactive": True,
                "description": "Red, green, blue, then saturation, in one run."},
}


def test(name):
    def deco(fn):
        TESTS[name] = fn
        return fn
    return deco


@test("rainbow")
async def rainbow(ctx, seconds=8):
    """Connection check, then rainbow on every pad, button, the strip and the display."""
    p = ctx.push
    checks = {"usb": ctx.status["usb"], "midi": ctx.status["midi"], "controls": 0}
    if not p.connected:
        return False, "Push not connected (USB %s, MIDI %s)" % (checks["usb"], checks["midi"])
    for i, (cid, c) in enumerate(c for c in R.CONTROLS.items() if "led" in c[1]):
        hue = (i % 24) / 24
        rgb = tuple(int(v * 255) for v in colorsys.hsv_to_rgb(hue, 1, 1))
        p.set_led(cid, rgb)
        checks["controls"] += 1
    p.set_strip([7] * 31)
    xs = np.arange(scenes.W, dtype=np.float32) / scenes.W
    for k in range(int(seconds * 15)):
        hue = ((xs + k * 0.02) % 1.0 * 255).astype(np.uint8)
        hsv = np.stack([np.tile(hue, (scenes.H, 1)), np.full((scenes.H, scenes.W), 255, np.uint8),
                        np.full((scenes.H, scenes.W), 255, np.uint8)], axis=-1)
        img = Image.fromarray(hsv, "HSV").convert("RGB")
        ImageDraw.Draw(img).text((480, 80), "PUSH 2 ONLINE", font=scenes.font(52, True), fill=(0, 0, 0), anchor="mm")
        p.set_frame(img)
        await asyncio.sleep(1 / 15)
    p.set_strip([0] * 31)
    return True, f"USB ok, MIDI ok, {checks['controls']} lit controls, display ok"


class Runner:
    def __init__(self):
        self.last = None  # (name, kwargs)

    async def run(self, ctx, name, **kwargs):
        if name not in TESTS:
            return False, f"unknown test {name}"
        self.last = (name, kwargs)
        try:
            return await TESTS[name](ctx, **kwargs)
        except Exception as exc:  # noqa: BLE001
            return False, f"{name} crashed: {exc}"

    async def rerun(self, ctx):
        if not self.last:
            return False, "no test has run yet"
        return await self.run(ctx, self.last[0], **self.last[1])


# ---------- colour calibration ----------
# Each level is an RGB value to give the panel. The user picks the one that looks truest; that becomes the
# panel's primary (see color.py). Level N maps to a button: 1-8 upper row, 9-10 lower row (first two).
RED_LEVELS = [(255, 48, 0), (255, 24, 0), (255, 0, 0), (255, 0, 12), (255, 0, 24), (255, 0, 36), (255, 0, 50),
              (255, 0, 66), (255, 0, 84), (255, 0, 104)]
GREEN_LEVELS = [(80, 255, 0), (50, 255, 0), (25, 255, 0), (0, 255, 0), (0, 255, 20), (0, 255, 40), (0, 255, 60),
                (0, 255, 85), (0, 255, 110), (0, 255, 140)]
SAT_LEVELS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9]
SAT_STRIPES = [(217, 119, 87), (162, 89, 255), (10, 207, 131), (242, 78, 30), (60, 140, 255)]
PICK_BUTTONS = R.UPPER + R.LOWER[:2]


def _slots(i):
    """(x0, y0, x1, y1) of swatch i: levels 1-8 above the upper buttons, 9-10 above lower buttons 1-2."""
    col = i % 8 if i < 8 else i - 8
    x0 = col * 120 + 7
    return (x0, 2, x0 + 105, 62) if i < 8 else (x0, 98, x0 + 105, 158)


async def _pick(ctx, title, hint, swatches):
    """swatches: list of 10 items, each an RGB tuple or a list of stripe RGBs. Returns the chosen index or None."""
    p = ctx.push
    p.raw = True  # show uncorrected colours so the pick is what the panel really does
    try:
        img = Image.new("RGB", (scenes.W, scenes.H), (0, 0, 0))
        d = ImageDraw.Draw(img)
        for i, sw in enumerate(swatches):
            box = _slots(i)
            stripes = sw if isinstance(sw, list) else [sw]
            w = (box[2] - box[0]) / len(stripes)
            for k, c in enumerate(stripes):
                d.rectangle([box[0] + k * w, box[1], box[0] + (k + 1) * w, box[3]], fill=tuple(c))
            d.text(((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), str(i + 1), font=scenes.font(26, True),
                   fill=(255, 255, 255), anchor="mm", stroke_width=3, stroke_fill=(0, 0, 0))
        d.text((480, 80), title, font=scenes.font(16, True), fill=(235, 235, 240), anchor="mm")
        d.text((480, 98), hint, font=scenes.mono(11), fill=(150, 150, 162), anchor="mm")
        p.set_frame(img)
        p.clear_leds()
        for i, sw in enumerate(swatches):  # the button LEDs show the same colours for comparison
            c = sw[0] if isinstance(sw, list) else sw
            p.set_led(PICK_BUTTONS[i], tuple(c))
        pick = await ctx.wait_press(PICK_BUTTONS, timeout=180)
    finally:
        p.raw = False
        ctx._leds_for = None
    return None if pick is None else PICK_BUTTONS.index(pick)


@test("cal_red")
async def cal_red(ctx):
    """10 reds; press the button under the one that looks most red."""
    i = await _pick(ctx, "WHICH RED LOOKS MOST RED?", "Press the button under it. 1-8 upper row, 9-10 lower row (first two).", RED_LEVELS)
    if i is None:
        return False, "no choice made (timed out)"
    ctx.set_calibration(red=list(RED_LEVELS[i]))
    return True, f"red = level {i + 1} {RED_LEVELS[i]}"


@test("cal_green")
async def cal_green(ctx):
    """10 greens; press the button under the one that looks most green."""
    i = await _pick(ctx, "WHICH GREEN LOOKS MOST GREEN?", "Press the button under it. 1-8 upper row, 9-10 lower row (first two).", GREEN_LEVELS)
    if i is None:
        return False, "no choice made (timed out)"
    ctx.set_calibration(green=list(GREEN_LEVELS[i]))
    return True, f"green = level {i + 1} {GREEN_LEVELS[i]}"


@test("cal_saturation")
async def cal_saturation(ctx):
    """10 saturation strengths on a sample palette; choose the richest that is not garish."""
    import numpy as np
    from . import color
    cal = dict(color.CAL)
    sw = []
    for s in SAT_LEVELS:
        stripes = []
        for c in SAT_STRIPES:
            stripes.append(tuple(int(v) for v in color.apply(np.array(c, dtype=np.uint8), {**cal, "saturation": s})))
        sw.append(stripes)
    i = await _pick(ctx, "PICK THE RICHEST COLOURS THAT STILL LOOK GOOD", "Level 1 = no boost. Press the button under your choice.", sw)
    if i is None:
        return False, "no choice made (timed out)"
    ctx.set_calibration(saturation=SAT_LEVELS[i])
    return True, f"saturation = x{SAT_LEVELS[i]} (level {i + 1})"


BLUE_LEVELS = [(0, 90, 255), (0, 60, 255), (0, 30, 255), (0, 0, 255), (20, 0, 255), (40, 0, 255), (60, 0, 255),
               (85, 0, 255), (110, 0, 255), (140, 0, 255)]


@test("cal_blue")
async def cal_blue(ctx):
    """10 blues; press the button under the one that looks most blue."""
    i = await _pick(ctx, "WHICH BLUE LOOKS MOST BLUE?", "Press the button under it. 1-8 upper row, 9-10 lower row (first two).", BLUE_LEVELS)
    if i is None:
        return False, "no choice made (timed out)"
    ctx.set_calibration(blue=list(BLUE_LEVELS[i]))
    return True, f"blue = level {i + 1} {BLUE_LEVELS[i]}"


@test("cal_all")
async def cal_all(ctx):
    """Guided: red, green, blue, then saturation (saturation last, since it builds on the primaries)."""
    results = []
    for name in ("cal_red", "cal_green", "cal_blue", "cal_saturation"):
        ok, summary = await TESTS[name](ctx)
        results.append(summary)
        if not ok:
            return False, f"stopped at {name}: {summary}"
    return True, "; ".join(results)


@test("knob_sensitivity")
async def knob_sensitivity(ctx, knob="knob-8"):
    """Count the ticks of one full rotation of a knob, so brightness and volume take the chosen number of turns."""
    from . import settings as cfg
    count = {"n": 0.0}

    def tap(ev):
        if ev["control"] == knob and ev["kind"] == "turn":
            count["n"] += abs(ev["value"])
        return ev["control"] == knob  # the knob is ours while measuring

    ctx.event_tap = tap
    waiter = asyncio.ensure_future(ctx.wait_press(["btn-select"], timeout=90))
    try:
        while not waiter.done():
            spec = {"accent": "#d97757", "zones": {}, "active": [], "no_zones": True, "toast": None, "widgets": [
                {"type": "title", "col": 0, "span": 8, "text": f"Turn Encoder 8 one full turn: {int(count['n'])}", "sub": "Then press Select", "size": "title"}]}
            ctx.push.set_frame(render.draw(spec))
            await asyncio.sleep(0.1)
    finally:
        ctx.event_tap = None
    if await waiter is None:
        return False, "timed out"
    n = int(count["n"])
    if n < 8:
        return False, f"only {n} ticks counted; turn the knob a full rotation first"
    ctx.settings["knob_ticks_per_turn"] = n
    ctx.settings["knob_measured"] = True
    cfg.save(ctx.settings)
    ctx.broadcast({"type": "settings", "settings": ctx.settings})
    return True, f"{n} ticks per turn: {100 / (ctx.settings['knob_turns_full_range'] * n):.2f}% per tick"

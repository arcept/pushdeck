"""Touch strip LEDs, fixed per Ableton's spec: config 0x63 (host LEDs + SysEx), 3-bit colour indices 0-7. Default config is 0x68."""
import math, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

out = mido.open_output("Ableton Push 2 User Port")
inp = mido.open_input("Ableton Push 2 User Port")
sx = lambda d: ph.sysex(out, d)
sx([0x0A, 0x02]); time.sleep(0.3)
dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)

def frame(lines):
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
    y = 6
    for i, t in enumerate(lines):
        d.text((20, y), t, font=ph.font(34 if i == 0 else 24), fill=(255, 255, 255) if i == 0 else (255, 220, 0))
        y += 46 if i == 0 else 32
    ph.send_frame(dev, img)

def hold(seconds, lines_fn):
    end = time.time() + seconds
    while time.time() < end:
        frame(lines_fn(end - time.time())); time.sleep(0.03)

def strip(levels):
    lv = (list(levels) + [0] * 32)[:32]
    sx([0x19] + [lv[2 * i] | (lv[2 * i + 1] << 3) for i in range(16)])

sx([0x17, 0x63])        # bits 0,1,5,6: host LEDs, host sends SysEx, autoreturn to centre
time.sleep(0.2)

# 1. what do colour indices 1-7 look like?  LEDs 0-27 in groups of 4: bottom = index 1, top = index 7
strip([1 + i // 4 for i in range(28)])
hold(6, lambda left: ["TOUCH STRIP  -  colour indices", "bottom to top: index 1, 2, 3, 4, 5, 6, 7 (4 LEDs each)",
                      "tell me the colour of each group", f"{left:4.1f}s left"])

# 2. sweep
t0 = time.time()
def sweep(left):
    pos = 15 + 14 * math.sin((time.time() - t0) * 3)
    strip([7 if abs(i - pos) < 1 else 3 if abs(i - pos) < 3 else 0 for i in range(31)])
    return ["TOUCH STRIP  -  sweep", "a light should move up and down", f"{left:4.1f}s left"]
hold(6, sweep)

# 3. follow finger
touching, pb = False, 0
def follow(left):
    global touching, pb
    for m in inp.iter_pending():
        if m.type == "note_on" and m.note == 12: touching = m.velocity > 0
        elif m.type == "pitchwheel": pb = m.pitch
    n = min(31, max(1, int((pb + 8192) / 16383 * 30) + 1))
    strip([3 if i < n - 1 else 7 if i == n - 1 else 0 for i in range(31)] if touching else [])
    return ["TOUCH STRIP  -  follow your finger", f"touching: {'YES' if touching else 'no'}   pitch bend: {pb:6d}   LED: {n if touching else '-'} / 31",
            f"{left:4.1f}s left"]
hold(14, follow)

strip([]); sx([0x17, 0x68])        # documented default
frame(["strip test done"]); time.sleep(0.5)
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)
print("done")

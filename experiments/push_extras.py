"""Smaller extras: pad animation channels (1-15) and touch strip LEDs. Display shows live status."""
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

def frame(lines, color=(255, 255, 255)):
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
    y = 6
    for i, t in enumerate(lines):
        d.text((20, y), t, font=ph.font(34 if i == 0 else 24), fill=color if i == 0 else (255, 220, 0 if i == 1 else 255) if i else color)
        y += 46 if i == 0 else 32
    ph.send_frame(dev, img)

def hold(seconds, lines_fn):
    end = time.time() + seconds
    while time.time() < end:
        frame(lines_fn(end - time.time())); time.sleep(0.03)

# ---------- 1. pad animations ----------
ph.set_palette_entry(out, 11, 0, 0, 90)       # A: dim blue
ph.set_palette_entry(out, 12, 255, 110, 0)    # B: bright orange
sx([5])
for ch in range(1, 16):
    out.send(mido.Message("note_on", channel=0, note=36 + ch - 1, velocity=11))   # start static in A
time.sleep(0.6)
for ch in range(1, 16):
    out.send(mido.Message("note_on", channel=ch, note=36 + ch - 1, velocity=12))  # transition to B with animation `ch`
hold(15, lambda left: ["PAD ANIMATIONS  (MIDI channel = style)",
                       "Row 1: ch 1-8   Row 2: ch 9-15",
                       "ch 1-5 one-shot fade   ch 6-10 pulse   ch 11-15 blink",
                       f"{left:4.1f}s left"])
for ch in range(1, 16):
    out.send(mido.Message("note_on", channel=0, note=36 + ch - 1, velocity=0))
ph.clear_pads(out)

# ---------- 2. touch strip LEDs ----------
sx([0x17, 0x41])                              # strip config: LEDs driven by host (sysex), pitch bend returns to centre
def strip(levels):
    lv = (list(levels) + [0] * 32)[:32]
    sx([0x19] + [lv[2 * i] | (lv[2 * i + 1] << 3) for i in range(16)])

t0 = time.time()
def sweep_lines(left):
    pos = 15 + 14 * math.sin((time.time() - t0) * 3)
    strip([max(0, 7 - int(abs(i - pos) * 3)) for i in range(31)])
    return ["TOUCH STRIP LEDs  -  sweep", "watch the light move up and down", "then touch & slide on the strip", f"{left:4.1f}s left"]
hold(6, sweep_lines)

touching, pb = False, 0
def follow_lines(left):
    global touching, pb
    for m in inp.iter_pending():
        if m.type == "note_on" and m.note == 12: touching = m.velocity > 0
        elif m.type == "pitchwheel": pb = m.pitch
    n = int((pb + 8192) / 16383 * 30) + 1
    strip([5 if i < n - 1 else 7 if i == n - 1 else 0 for i in range(31)] if touching else [])
    return ["TOUCH STRIP LEDs  -  follow your finger",
            f"touching: {'YES' if touching else 'no'}    pitch bend: {pb:6d}    LED position: {n if touching else '-'} / 31",
            "a bar of light should follow your finger", f"{left:4.1f}s left"]
hold(14, follow_lines)
strip([]); sx([0x17, 0x40])                   # LEDs off, hand the strip back to the Push
frame(["extras done"]); time.sleep(0.5)
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)
print("done")

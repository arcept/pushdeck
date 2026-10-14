"""Pad velocity -> brightness, pressure -> hue (per pad, sticky). Encoders: 1 display, 2 LEDs, 3 base hue."""
import colorsys, json, sys, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

secs = float(sys.argv[1]) if len(sys.argv) > 1 else 180
PRESS_GAIN = 2                                   # pressure * gain = hue step (0-255)
disp, led, base_hue = 132, 67, 0                 # assumed from the last run; brightness is NOT re-sent at start

out = mido.open_output("Ableton Push 2 User Port")
inp = mido.open_input("Ableton Push 2 User Port")
sysex = lambda d: ph.sysex(out, d)
sp = lambda v: [v & 0x7F, v >> 7]
hsv = lambda h, v=1.0: [int(c * 255) for c in colorsys.hsv_to_rgb((h % 256) / 256.0, 1, v)]
vel_bright = lambda v: 0.2 + 0.8 * min(1.0, v / 90.0)
set_led  = lambda v: sysex([0x06, v])
set_disp = lambda v: sysex([0x08, v & 0x7F, v >> 7])

rgb_buttons = set(range(20, 28)) | set(range(36, 44)) | set(range(102, 110)) | {60, 61, 29, 85, 86, 89}
buttons = {int(k) for k in json.load(open("buttons_seen.json"))} | rgb_buttons
buttons |= {30, 31, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63}
buttons -= set(range(71, 80)) | {14, 15}
white_buttons = buttons - rgb_buttons

def set_base(h):
    r, g, b = hsv(h); sysex([3, 101] + sp(r) + sp(g) + sp(b) + sp(0))
def set_pad(idx, h, bright):
    r, g, b = hsv(h, bright)
    sysex([3, 1 + idx] + sp(r) + sp(g) + sp(b) + sp(0))
    out.send(mido.Message("note_on", channel=0, note=36 + idx, velocity=1 + idx))

sysex([0x0A, 0x02]); sysex([0x1E, 0x01]); time.sleep(0.3)   # dual MIDI mode + polyphonic aftertouch
sysex([3, 100] + sp(255) * 4); set_base(base_hue); sysex([5])
for i in range(64): out.send(mido.Message("note_on", channel=0, note=36 + i, velocity=101))
for cc in rgb_buttons:   out.send(mido.Message("control_change", channel=0, control=cc, value=101))
for cc in white_buttons: out.send(mido.Message("control_change", channel=0, control=cc, value=100))

strip = Image.new("RGB", (500, 12)); sd = ImageDraw.Draw(strip)
for x in range(500): sd.line([(x, 0), (x, 12)], fill=tuple(hsv(int(x / 500 * 256))))

last = {"idx": None, "vel": 0, "press": 0, "peak": 0, "hue": 0, "bright": 0}
held = []                                          # pad indices currently down, latest last
pads = {}                                          # per-pad state: vel, peak, bright

def bar(d, x, y, w, frac, fill=(255, 255, 255)):
    d.rectangle([x, y, x + w, y + 12], outline=(110, 110, 110))
    d.rectangle([x, y, x + int(w * max(0, min(1, frac))), y + 12], fill=fill)

def draw():
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
    f = ph.font(20)
    d.text((20, 2), "Enc 1  DISPLAY brightness", font=f, fill=(255, 255, 255)); d.text((400, 2), f"{disp}/255", font=f, fill=(255, 220, 0)); bar(d, 20, 30, 500, disp / 255)
    d.text((20, 54), "Enc 2  LED brightness", font=f, fill=(255, 255, 255));    d.text((400, 54), f"{led}/127", font=f, fill=(255, 220, 0)); bar(d, 20, 82, 500, led / 127)
    d.text((20, 106), "Enc 3  base HUE", font=f, fill=(255, 255, 255));         d.text((400, 106), f"{base_hue}/255", font=f, fill=(255, 220, 0))
    img.paste(strip, (20, 138)); x = 20 + int(500 * base_hue / 256); d.rectangle([x - 2, 134, x + 2, 154], outline=(255, 255, 255))
    d.line([(560, 8), (560, 152)], fill=(60, 60, 60))
    if last["idx"] is None:
        d.text((590, 60), "Press a pad", font=ph.font(32), fill=(150, 150, 150)); return img
    row, col = divmod(last["idx"], 8)
    d.text((590, 2), f"PAD  row {row + 1}, col {col + 1}", font=ph.font(24), fill=(255, 255, 255))
    d.text((590, 40), f"Velocity {last['vel']:3d}  -> brightness", font=f, fill=(255, 220, 0)); bar(d, 590, 66, 340, last["vel"] / 127)
    d.text((590, 86), f"Pressure {last['press']:3d}  peak {last['peak']:3d} -> hue", font=f, fill=(255, 220, 0)); bar(d, 590, 112, 340, last["peak"] * PRESS_GAIN / 255)
    d.rectangle([590, 134, 930, 156], fill=tuple(hsv(last["hue"], last["bright"])))
    return img

dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
end = time.time() + secs
print("Running. Hit pads: velocity = brightness, pressure = hue.", flush=True)
log = []
while time.time() < end:
    palette_dirty = False
    for m in inp.iter_pending():
        if m.type == "control_change" and m.control in (71, 72, 73):
            step = m.value if m.value < 64 else m.value - 128
            if m.control == 71:   disp = max(0, min(255, disp + step * 3)); set_disp(disp)
            elif m.control == 72: led = max(0, min(127, led + step * 2)); set_led(led)
            else:                 base_hue = (base_hue + step) % 256; set_base(base_hue); palette_dirty = True
        elif m.type == "note_on" and 36 <= m.note <= 99 and m.velocity > 0:
            idx = m.note - 36
            held.append(idx); pads[idx] = {"vel": m.velocity, "peak": 0, "bright": vel_bright(m.velocity)}
            last.update(idx=idx, vel=m.velocity, press=0, peak=0, hue=0, bright=vel_bright(m.velocity))
            set_pad(idx, 0, last["bright"]); palette_dirty = True
        elif (m.type == "note_off" or (m.type == "note_on" and m.velocity == 0)) and 36 <= m.note <= 99:
            idx = m.note - 36
            if idx in held: held.remove(idx)
            if idx == last["idx"]: log.append((idx, last["vel"], last["peak"])); last["press"] = 0
        elif m.type == "polytouch" and 36 <= m.note <= 99:
            idx = m.note - 36; st = pads.get(idx)
            if st:
                st["peak"] = max(st["peak"], m.value); hue = min(255, st["peak"] * PRESS_GAIN)
                last.update(idx=idx, vel=st["vel"], press=m.value, peak=st["peak"], hue=hue, bright=st["bright"])
                set_pad(idx, hue, st["bright"]); palette_dirty = True
    if palette_dirty: sysex([5])
    ph.send_frame(dev, draw()); time.sleep(0.02)
print(f"hits={len(log)}  max velocity={max([v for _, v, _ in log], default=0)}  max peak pressure={max([p for _, _, p in log], default=0)}", flush=True)
sysex([0x1E, 0x00])   # back to channel pressure
print(f"final: display={disp}, led={led}, base_hue={base_hue}", flush=True)
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)
ph.clear_pads(out)
for cc in buttons: out.send(mido.Message("control_change", channel=0, control=cc, value=0))

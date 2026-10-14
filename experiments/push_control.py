"""Encoder 1 = display brightness, 2 = LED brightness, 3 = hue (256 steps). Shown live on the display."""
import colorsys, json, sys, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

secs = float(sys.argv[1]) if len(sys.argv) > 1 else 180
disp, led, hue = 128, 64, 0

out = mido.open_output("Ableton Push 2 User Port")
inp = mido.open_input("Ableton Push 2 User Port")
sysex = lambda d: ph.sysex(out, d)
sp = lambda v: [v & 0x7F, v >> 7]
set_led  = lambda v: sysex([0x06, v])
set_disp = lambda v: sysex([0x08, v & 0x7F, v >> 7])

def hue_rgb(h): return [int(c * 255) for c in colorsys.hsv_to_rgb(h / 256.0, 1, 1)]
def set_hue(h):
    r, g, b = hue_rgb(h)
    sysex([3, 101] + sp(r) + sp(g) + sp(b) + sp(0)); sysex([5])

rgb_buttons = set(range(20, 28)) | set(range(36, 44)) | set(range(102, 110)) | {60, 61, 29, 85, 86, 89}
buttons = {int(k) for k in json.load(open("buttons_seen.json"))} | rgb_buttons
buttons |= {30, 31, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63}
buttons -= set(range(71, 80)) | {14, 15}
white_buttons = buttons - rgb_buttons

sysex([0x0A, 0x02]); time.sleep(0.3)
sysex([3, 100] + sp(255) * 4)            # entry 100: white (RGB + white channel)
set_hue(hue)                              # entry 101: the current hue
for i in range(64): out.send(mido.Message("note_on", channel=0, note=36 + i, velocity=101))
for cc in rgb_buttons:   out.send(mido.Message("control_change", channel=0, control=cc, value=101))
for cc in white_buttons: out.send(mido.Message("control_change", channel=0, control=cc, value=100))
set_led(led); set_disp(disp)

strip = Image.new("RGB", (880, 14))
sd = ImageDraw.Draw(strip)
for x in range(880): sd.line([(x, 0), (x, 14)], fill=tuple(hue_rgb(int(x / 880 * 256))))

def row(d, img, y, label, val_txt, frac):
    d.text((40, y), label, font=ph.font(22), fill=(255, 255, 255))
    d.text((640, y), val_txt, font=ph.font(22), fill=(255, 220, 0))
    d.rectangle([40, y + 30, 920, y + 44], outline=(120, 120, 120))
    d.rectangle([40, y + 30, 40 + int(880 * frac), y + 44], fill=(255, 255, 255))

def draw():
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
    row(d, img, 2,   "Encoder 1  DISPLAY brightness", f"{disp} / 255", disp / 255)
    row(d, img, 54,  "Encoder 2  LED brightness",     f"{led} / 127",  led / 127)
    d.text((40, 106), "Encoder 3  HUE", font=ph.font(22), fill=(255, 255, 255))
    r, g, b = hue_rgb(hue)
    d.text((640, 106), f"{hue} / 255   RGB({r},{g},{b})", font=ph.font(22), fill=(255, 220, 0))
    img.paste(strip, (40, 136))
    x = 40 + int(880 * hue / 256)
    d.rectangle([x - 2, 132, x + 2, 154], outline=(255, 255, 255), fill=(0, 0, 0))
    return img

dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
end = time.time() + secs
print("Running. Encoder 1 = display, 2 = LEDs, 3 = hue.", flush=True)
while time.time() < end:
    hue_changed = False
    for m in inp.iter_pending():
        if m.type == "control_change" and m.control in (71, 72, 73):
            step = m.value if m.value < 64 else m.value - 128
            if m.control == 71:   disp = max(0, min(255, disp + step * 3)); set_disp(disp)
            elif m.control == 72: led  = max(0, min(127, led  + step * 2)); set_led(led)
            else:                 hue = (hue + step) % 256; hue_changed = True
    if hue_changed: set_hue(hue)
    ph.send_frame(dev, draw()); time.sleep(0.03)
print(f"final: display={disp}/255, led={led}/127, hue={hue}/255", flush=True)
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)
ph.clear_pads(out)
for cc in buttons: out.send(mido.Message("control_change", channel=0, control=cc, value=0))

"""Encoder 1 = display brightness (0-255), Encoder 2 = LED brightness (0-127). Shown live on the display."""
import json, sys, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

secs = float(sys.argv[1]) if len(sys.argv) > 1 else 120
disp, led = 128, 64                      # start mid-way so you can turn up to max

out = mido.open_output("Ableton Push 2 User Port")
inp = mido.open_input("Ableton Push 2 User Port")
def sysex(d): ph.sysex(out, d)
def set_led(v):  sysex([0x06, v])
def set_disp(v): sysex([0x08, v & 0x7F, v >> 7])

buttons = {int(k) for k in json.load(open("buttons_seen.json"))}
buttons |= set(range(20, 28)) | set(range(36, 44)) | set(range(102, 110)) | {60, 61, 29, 85, 86, 89}
buttons |= {30, 31, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63}
buttons -= set(range(71, 80)) | {14, 15}

sysex([0x0A, 0x02]); time.sleep(0.3)
sp = lambda v: [v & 0x7F, v >> 7]
sysex([3, 100] + sp(255) * 4); sysex([5])                    # white in RGB and white channels
for i in range(64): out.send(mido.Message("note_on", channel=0, note=36 + i, velocity=100))
for cc in buttons:   out.send(mido.Message("control_change", channel=0, control=cc, value=100))
set_led(led); set_disp(disp)

def bar(d, y, label, v, vmax):
    d.text((40, y), f"{label}", font=ph.font(30), fill=(255, 255, 255))
    d.text((760, y), f"{v} / {vmax}", font=ph.font(30), fill=(255, 220, 0))
    d.rectangle([40, y + 42, 920, y + 62], outline=(120, 120, 120))
    d.rectangle([40, y + 42, 40 + int(880 * v / vmax), y + 62], fill=(255, 255, 255))

def draw():
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
    bar(d, 6, "Encoder 1 - DISPLAY brightness", disp, 255)
    bar(d, 82, "Encoder 2 - LED brightness (pads + buttons)", led, 127)
    return img

dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
end, last = time.time() + secs, None
print("Running. Encoder 1 = display, Encoder 2 = LEDs.", flush=True)
while time.time() < end:
    for m in inp.iter_pending():
        if m.type == "control_change" and m.control in (71, 72):
            step = m.value if m.value < 64 else m.value - 128   # relative: 1 = cw, 127 = ccw
            if m.control == 71: disp = max(0, min(255, disp + step * 3)); set_disp(disp)
            else:               led  = max(0, min(127, led  + step * 2)); set_led(led)
    ph.send_frame(dev, draw()); time.sleep(0.03)
print(f"final: display={disp}/255, led={led}/127", flush=True)
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)
ph.clear_pads(out)
for cc in buttons: out.send(mido.Message("control_change", channel=0, control=cc, value=0))

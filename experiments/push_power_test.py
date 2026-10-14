"""Max-load power test: all pads, all buttons, bright display for N seconds. Usage: push_power_test.py "<label>" [seconds]"""
import colorsys, json, sys, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

label = sys.argv[1] if len(sys.argv) > 1 else "POWER TEST"
secs = float(sys.argv[2]) if len(sys.argv) > 2 else 30

buttons = {int(k) for k in json.load(open("buttons_seen.json"))}
buttons |= set(range(20, 28)) | set(range(36, 44)) | set(range(102, 110)) | {60, 61, 29, 85, 86, 89}
buttons |= {30, 31, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63}
buttons -= set(range(71, 80)) | {14, 15}   # encoders have no LED

out = mido.open_output("Ableton Push 2 User Port")
ph.sysex(out, [0x0A, 0x02]); time.sleep(0.3)
ph.rainbow(out)                                           # uses palette entries 1-64
sp = lambda v: [v & 0x7F, v >> 7]
ph.sysex(out, [3, 100] + sp(255) * 4)                     # white in RGB and white channels
ph.sysex(out, [5])
for cc in sorted(buttons):
    out.send(mido.Message("control_change", channel=0, control=cc, value=100))
print(f"[{label}] pads + {len(buttons)} buttons lit; display running for {secs:.0f}s", flush=True)

img = Image.new("RGB", (ph.W, ph.H), (255, 255, 255))     # full-white display = maximum backlight load
d = ImageDraw.Draw(img)
d.rectangle([20, 20, 940, 140], fill=(0, 0, 0))
d.text((50, 30), label, font=ph.font(64), fill=(255, 255, 255))
d.text((50, 105), "pads + buttons + display at full brightness", font=ph.font(26), fill=(255, 220, 0))

dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
end = time.time() + secs
while time.time() < end:
    ph.send_frame(dev, img); time.sleep(0.05)
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)
ph.clear_pads(out)
for cc in buttons: out.send(mido.Message("control_change", channel=0, control=cc, value=0))
print("done")

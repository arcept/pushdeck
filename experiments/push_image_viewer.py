"""Show images on the Push display (960x160 crops). Left/Right arrows = switch image, Up/Down = move the crop band.
Usage: push_image_viewer.py [seconds] [folder]   (folder defaults to display-images/; put your own .webp files there)"""
import glob, sys, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

secs = float(sys.argv[1]) if len(sys.argv) > 1 else 180
paths = sorted(glob.glob((sys.argv[2] if len(sys.argv) > 2 else "display-images") + "/*.webp"))
if not paths:
    sys.exit("No .webp images found; pass a folder or add your own to experiments/display-images/")
images = [Image.open(p).convert("RGB") for p in paths]
pan = [0.28, 0.50] + [0.5] * 8                                  # starting band position per image (0 = top, 1 = bottom)
print([(p, im.size) for p, im in zip(paths, images)], flush=True)

def crop(i):
    im = images[i]; w, h = im.size
    band = w * ph.H / ph.W                                      # full width, height for a 6:1 band
    top = (h - band) * pan[i]
    return im.crop((0, round(top), w, round(top + band))).resize((ph.W, ph.H), Image.LANCZOS)

inp = mido.open_input("Ableton Push 2 User Port"); out = mido.open_output("Ableton Push 2 User Port")
ph.sysex(out, [0x0A, 0x02]); time.sleep(0.2)
sp = lambda v: [v & 0x7F, v >> 7]
ph.sysex(out, [3, 100] + sp(200) * 4); ph.sysex(out, [5])
for cc in (44, 45, 46, 47): out.send(mido.Message("control_change", channel=0, control=cc, value=100))   # light the arrows

dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
cur, frame, label_until = 0, crop(0), time.time() + 2
end = time.time() + secs
while time.time() < end:
    changed = False
    for m in inp.iter_pending():
        if m.type == "control_change" and m.value > 0:
            if m.control == 44: cur = (cur - 1) % len(images); changed = True
            elif m.control == 45: cur = (cur + 1) % len(images); changed = True
            elif m.control == 46: pan[cur] = max(0.0, pan[cur] - 0.05); changed = True
            elif m.control == 47: pan[cur] = min(1.0, pan[cur] + 0.05); changed = True
    if changed:
        frame = crop(cur); label_until = time.time() + 1.5
        print(f"image {cur + 1}/{len(images)}  band position {pan[cur]:.2f}", flush=True)
    img = frame
    if time.time() < label_until:
        img = frame.copy(); d = ImageDraw.Draw(img)
        d.rectangle([8, 8, 150, 36], fill=(0, 0, 0)); d.text((14, 11), f"{cur + 1}/{len(images)}  {pan[cur]:.2f}", font=ph.font(20), fill=(255, 255, 255))
    ph.send_frame(dev, img); time.sleep(0.02)
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)
for cc in (44, 45, 46, 47): out.send(mido.Message("control_change", channel=0, control=cc, value=0))

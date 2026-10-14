"""Display calibration pattern: exact 960x160, border, circle (aspect), ruler, colour bars, 1px patterns."""
import sys, time
import usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

secs = float(sys.argv[1]) if len(sys.argv) > 1 else 40
W, H = ph.W, ph.H
img = Image.new("RGB", (W, H), (0, 0, 0)); d = ImageDraw.Draw(img)

d.rectangle([0, 0, W - 1, H - 1], outline=(255, 255, 255))                      # 1px border on all four edges
for (x, y, sx, sy) in ((0, 0, 1, 1), (W - 1, 0, -1, 1), (0, H - 1, 1, -1), (W - 1, H - 1, -1, -1)):
    d.line([(x, y), (x + sx * 24, y)], fill=(255, 60, 60)); d.line([(x, y), (x, y + sy * 24)], fill=(255, 60, 60))   # corner marks
for x in range(0, W, 10):                                                        # ruler along the top
    d.line([(x, 1), (x, 12 if x % 100 == 0 else 6 if x % 50 == 0 else 3)], fill=(180, 180, 180))
for x in range(100, W, 100): d.text((x - 10, 14), str(x), font=ph.font(14), fill=(200, 200, 200))
d.text((6, 14), "0", font=ph.font(14), fill=(200, 200, 200)); d.text((W - 34, 14), "960", font=ph.font(14), fill=(200, 200, 200))
d.line([(W // 2, 30), (W // 2, H - 31)], fill=(70, 70, 70)); d.line([(300, H // 2), (W - 300, H // 2)], fill=(70, 70, 70))   # crosshair
cx, cy, r = W // 2, H // 2, 46
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(0, 255, 120), width=2)    # circle: must look round
d.rectangle([cx - r, cy - r, cx + r, cy + r], outline=(0, 160, 80))            # square around it: must look square
d.text((cx - 62, cy - 8), "960 x 160", font=ph.font(20), fill=(255, 255, 255))
for i, c in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)]):   # colour bars (left)
    d.rectangle([20 + i * 60, 40, 74 + i * 60, 100], fill=c)
for y in range(0, 40):                                                           # 1px alternating lines (left, bottom)
    d.line([(20, 108 + y // 1 % 2 + y), (260, 108 + y // 1 % 2 + y)], fill=(255, 255, 255)) if y % 2 == 0 and 108 + y < H - 3 else None
for yy in range(110, H - 4, 2): d.line([(20, yy), (260, yy)], fill=(255, 255, 255))
for gy in range(40, 100, 6):                                                     # checkerboard (right)
    for gx in range(W - 280, W - 20, 6):
        if ((gx - (W - 280)) // 6 + (gy - 40) // 6) % 2 == 0: d.rectangle([gx, gy, gx + 5, gy + 5], fill=(255, 255, 255))
for x in range(W - 280, W - 20, 2): d.line([(x, 108), (x, H - 5)], fill=(255, 255, 255)) if (x // 2) % 2 == 0 else None  # vertical 1px lines
print("image size:", img.size, "mode:", img.mode)

dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
end = time.time() + secs
while time.time() < end: ph.send_frame(dev, img); time.sleep(0.03)
ph.send_frame(dev, Image.new("RGB", (W, H), (0, 0, 0)))
usb.util.dispose_resources(dev)
img.save("display_test_pattern.png")
print("saved display_test_pattern.png")

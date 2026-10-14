"""Display frame-rate test.
Phase A: pre-rendered frames, measures raw USB transfer speed.
Phase B: render a frame with PIL + convert + send every time, measures the real pipeline speed."""
import statistics, sys, time

import numpy as np
import usb.core
import usb.util
from PIL import Image, ImageDraw

import push_hello as ph

SECS = 6
dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration()
usb.util.claim_interface(dev, 0)
HEADER = bytes([0xFF, 0xCC, 0xAA, 0x88] + [0] * 12)


def bars(offset, label, extra=""):
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    for i in range(-1, 21):
        x = (i * 48 + offset) % (21 * 48) - 48
        hue = (i * 12) % 256
        c = tuple(int(v * 255) for v in __import__("colorsys").hsv_to_rgb(hue / 256, 1, 1))
        d.rectangle([x, 70, x + 40, 160], fill=c)
    d.text((20, 6), label, font=ph.font(34), fill=(255, 255, 255))
    d.text((20, 40), extra, font=ph.font(24), fill=(255, 220, 0))
    return img


def chunks_for(img):
    data = np.frombuffer(ph.to_frame(img), dtype=np.uint8)
    return [(data[o:o + 16384] ^ ph.MASK).tobytes() for o in range(0, len(data), 16384)]


def send_chunks(chunks):
    dev.write(0x01, HEADER, 1000)
    for c in chunks:
        dev.write(0x01, c, 1000)


def stats(times):
    times = sorted(times)
    mean = statistics.mean(times)
    return {"frames": len(times), "fps": len(times) / sum(times), "mean_ms": mean * 1000,
            "p95_ms": times[int(len(times) * 0.95)] * 1000, "max_ms": times[-1] * 1000}


# Phase A: pre-rendered, transfer only
frames = [chunks_for(bars(k * 24, "PHASE A", "pre-rendered, USB transfer only")) for k in range(21)]
tA, end, k = [], time.time() + SECS, 0
while time.time() < end:
    t = time.perf_counter(); send_chunks(frames[k % len(frames)]); tA.append(time.perf_counter() - t); k += 1
A = stats(tA)

# Phase B: full pipeline
tB, end, k = [], time.time() + SECS, 0
while time.time() < end:
    t = time.perf_counter()
    send_chunks(chunks_for(bars(k * 24, "PHASE B", f"render + convert + send   (A was {A['fps']:.0f} fps)")))
    tB.append(time.perf_counter() - t); k += 1
B = stats(tB)

send_chunks(chunks_for(Image.new("RGB", (ph.W, ph.H), (0, 0, 0))))
usb.util.dispose_resources(dev)
for name, s in (("A  transfer only", A), ("B  render+convert+send", B)):
    print(f"{name:24s} {s['fps']:5.1f} fps   mean {s['mean_ms']:.1f} ms   p95 {s['p95_ms']:.1f} ms   worst {s['max_ms']:.1f} ms   ({s['frames']} frames)")

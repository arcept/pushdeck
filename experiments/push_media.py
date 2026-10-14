"""Play an MP4 or GIF on the Push display (looping), with frame-rate stats.
Usage: push_media.py <file.mp4|file.gif> [seconds] [band_position 0-1]"""
import statistics, sys, time
import imageio.v2 as iio
import usb.core, usb.util
from PIL import Image, ImageSequence
import push_hello as ph

path = sys.argv[1]; secs = float(sys.argv[2]) if len(sys.argv) > 2 else 15; pos = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
W, H = ph.W, ph.H

def cover(im):
    w, h = im.size; band = w * H / W
    if band > h:                                   # image wider than 6:1: crop sides instead
        nw = h * W / H; left = (w - nw) / 2
        return im.crop((round(left), 0, round(left + nw), h)).resize((W, H), Image.LANCZOS)
    top = (h - band) * pos
    return im.crop((0, round(top), w, round(top + band))).resize((W, H), Image.LANCZOS)

def mp4_frames():
    vf = f"crop=iw:iw/6:0:(ih-iw/6)*{pos},scale={W}:{H}:flags=lanczos"
    r = iio.get_reader(path, "ffmpeg", output_params=["-vf", vf])
    try:
        for f in r: yield Image.fromarray(f), None
    finally: r.close()

def gif_frames():
    im = Image.open(path)
    frames = [(cover(f.convert("RGB")), f.info.get("duration", 100) / 1000.0) for f in ImageSequence.Iterator(im)]
    while True:
        for fr in frames: yield fr

if path.lower().endswith(".mp4"):
    meta = iio.get_reader(path, "ffmpeg").get_meta_data(); fps = meta["fps"]
    def source():
        while True:
            yield from mp4_frames()
    interval = lambda d: 1.0 / fps
    kind = f"MP4 {meta['size'][0]}x{meta['size'][1]} @ {fps:g} fps"
else:
    def source(): return gif_frames()
    interval = lambda d: d
    kind = "GIF"

sent = dropped = 0; send_t = []; t_start = time.perf_counter(); due = t_start
for img, dur in source():
    now = time.perf_counter()
    step = interval(dur)
    if now - t_start >= secs: break
    if now > due + step:                           # running behind: drop this frame
        dropped += 1; due += step; continue
    t = time.perf_counter(); ph.send_frame(dev, img); send_t.append(time.perf_counter() - t); sent += 1
    due += step
    wait = due - time.perf_counter()
    if wait > 0: time.sleep(wait)
elapsed = time.perf_counter() - t_start
ph.send_frame(dev, Image.new("RGB", (W, H), (0, 0, 0)))
usb.util.dispose_resources(dev)
st = sorted(send_t)
print(f"{kind}: {elapsed:.1f}s  sent {sent} frames ({sent / elapsed:.1f} fps), dropped {dropped}; "
      f"send time mean {statistics.mean(st) * 1000:.1f} ms, p95 {st[int(len(st) * 0.95)] * 1000:.1f} ms, worst {st[-1] * 1000:.1f} ms")

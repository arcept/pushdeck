"""Claude usage on the Push: display bars + pad gauges + touch-strip gauge + Record warning light.
Reads ~/.claude/push_usage.json (written by claude_statusline.py); falls back to usage_demo.json until that exists.
Usage: push_usage_display.py [seconds]"""
import json, os, sys, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

secs = float(sys.argv[1]) if len(sys.argv) > 1 else 90
LIVE = os.path.expanduser("~/.claude/push_usage.json")
DEMO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage_demo.json")
WARN_CC = 86                                             # Record button (RGB): red when weekly >= 90%

def load():
    for path, tag in ((LIVE, "LIVE"), (DEMO, "DEMO")):
        try:
            d = json.load(open(path)); d["_tag"] = tag; return d
        except Exception:
            continue
    return {"_tag": "NO DATA"}

def window(d, key):
    w = d.get(key) or {}
    pct, reset = w.get("used_percentage"), w.get("resets_at")
    if pct is None: return None, None
    if reset and reset < time.time(): return 0.0, None   # window has reset since the last update
    return float(pct), reset

def level(p):  return "green" if p < 60 else "amber" if p < 85 else "red"
COL = {"green": (60, 200, 90), "amber": (255, 180, 30), "red": (255, 50, 50)}
def countdown(reset):
    if not reset: return "reset"
    s = max(0, int(reset - time.time())); h, m = s // 3600, (s % 3600) // 60
    return f"{s // 86400}d {h % 24}h" if s >= 86400 else f"{h}h {m:02d}m"

out = mido.open_output("Ableton Push 2 User Port")
sx = lambda d: ph.sysex(out, d)
sp = lambda v: [v & 0x7F, v >> 7]
sx([0x0A, 0x02]); time.sleep(0.3)
for idx, name in ((11, "green"), (12, "amber"), (13, "red")): ph.set_palette_entry(out, idx, *COL[name])
ph.set_palette_entry(out, 14, 25, 25, 30)                 # unlit pad
idx_of = {"green": 11, "amber": 12, "red": 13}
sx([5])
sx([0x17, 0x63])                                          # touch strip: host-controlled LEDs

def strip(levels):
    lv = (list(levels) + [0] * 32)[:32]
    sx([0x19] + [lv[2 * i] | (lv[2 * i + 1] << 3) for i in range(16)])

def pads(row, pct):
    lit = 0 if pct is None else int(pct / 12.5 + 0.5)    # 8 pads of 12.5%
    col = idx_of[level(pct or 0)]
    for i in range(8):
        out.send(mido.Message("note_on", channel=0, note=36 + row * 8 + i, velocity=col if i < lit else 14))

def bar(d, y, label, pct, reset):
    d.text((20, y), label, font=ph.font(26), fill=(255, 255, 255))
    if pct is None:
        d.text((300, y), "no data", font=ph.font(26), fill=(150, 150, 150)); return
    c = COL[level(pct)]
    d.text((300, y), f"{pct:.0f}%", font=ph.font(30), fill=c)
    d.text((400, y + 4), f"resets in {countdown(reset)}", font=ph.font(22), fill=(180, 180, 180))
    d.rectangle([20, y + 38, 940, y + 56], outline=(110, 110, 110))
    d.rectangle([20, y + 38, 20 + int(920 * min(pct, 100) / 100), y + 56], fill=c)

dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
end, data, last_load = time.time() + secs, load(), 0
try:
    while time.time() < end:
        if time.time() - last_load > 2:                     # re-read the file every 2 s (it's just a local file)
            data, last_load = load(), time.time()
            p5, _ = window(data, "five_hour"); pw, _ = window(data, "seven_day")
            pads(0, p5); pads(1, pw)
            n = 0 if pw is None else int(pw / 100 * 31 + 0.5)
            strip([5] * n)
            out.send(mido.Message("control_change", channel=0, control=WARN_CC, value=idx_of["red"] if (pw or 0) >= 90 else 0))
        p5, r5 = window(data, "five_hour"); pw, rw = window(data, "seven_day")
        img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
        bar(d, 4, "5-hour limit", p5, r5); bar(d, 70, "Weekly (all models)", pw, rw)
        tag = data["_tag"]; upd = data.get("updated_at")
        age = f"updated {int((time.time() - upd) // 60)} min ago" if upd else ""
        d.text((20, 134), f"source: {tag}   {age}", font=ph.font(18), fill=(255, 120, 0) if tag != "LIVE" else (120, 220, 120))
        ph.send_frame(dev, img); time.sleep(0.1)
finally:
    strip([]); sx([0x17, 0x68])
    ph.clear_pads(out); out.send(mido.Message("control_change", channel=0, control=WARN_CC, value=0))
    ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
    usb.util.dispose_resources(dev)

"""Button name sweep: all buttons lit bright; each pressed button drops to half brightness; saves press order."""
import json, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

reg = json.load(open("../push2_registry.json"))
b = reg["buttons"]
known = set(b["rgb"]["lower_display_row"]) | set(b["rgb"]["upper_display_row"]) | set(b["rgb"]["scene_launch_column"])
known |= {int(k) for k in b["rgb"]["named"]} | set(b["white_only"])
ENC = {14, 15} | set(range(71, 80))

out = mido.open_output("Ableton Push 2 User Port")
inp = mido.open_input("Ableton Push 2 User Port")
sx = lambda d: ph.sysex(out, d)
sp = lambda v: [v & 0x7F, v >> 7]
sx([0x0A, 0x02]); time.sleep(0.3)
sx([3, 100] + sp(255) * 4)      # bright white (RGB + white channel)
sx([3, 101] + sp(110) * 4)      # half-ish brightness: pressed
sx([5])
for cc in known: out.send(mido.Message("control_change", channel=0, control=cc, value=100))

dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
prev = json.load(open('button_press_order.json')) if __import__('os').path.exists('button_press_order.json') else {}
order, unknown = list(prev.get('order', [])), list(prev.get('unmapped', []))
for cc in order: out.send(mido.Message('control_change', channel=0, control=cc, value=101))
import sys
start_count = len(order)
goal = int(sys.argv[1]) if len(sys.argv) > 1 else 10**6
last_press = time.time(); start = time.time()

def draw():
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
    d.text((20, 4), f"BUTTON SWEEP   {len(order)} / {len(known)} pressed", font=ph.font(38), fill=(255, 255, 255))
    d.text((20, 56), "last: " + (f"#{len(order)} = CC {order[-1]}" if order else "(press the first button)"), font=ph.font(26), fill=(255, 220, 0))
    d.text((20, 96), "order: " + " ".join(str(c) for c in order[-16:]), font=ph.font(22), fill=(200, 200, 200))
    if unknown: d.text((20, 128), "NEW (unmapped) CCs: " + " ".join(map(str, unknown)), font=ph.font(22), fill=(255, 120, 0))
    ph.send_frame(dev, d_img(img))

def d_img(i): return i

print("Lit. Sweep the buttons in your order.", flush=True)
while time.time() - start < 400:
    for m in inp.iter_pending():
        if m.type == "control_change" and m.value > 0 and m.control not in ENC:
            last_press = time.time()
            if m.control in known:
                if m.control not in order:
                    order.append(m.control)
                    out.send(mido.Message("control_change", channel=0, control=m.control, value=101))
                    print(f"#{len(order):2d}  CC {m.control}", flush=True)
                    json.dump({'order': order, 'unmapped': unknown}, open('button_press_order.json', 'w'))
            elif m.control not in unknown:
                unknown.append(m.control); print(f"unmapped CC {m.control}", flush=True)
    draw(); time.sleep(0.02)
    if len(order) >= len(known) or len(order) - start_count >= goal: break
    if order and time.time() - last_press > 120: break
json.dump({"order": order, "unmapped": unknown, "missing": sorted(known - set(order))}, open("button_press_order.json", "w"), indent=2)
print("pressed:", len(order), "| missing:", sorted(known - set(order)), "| unmapped:", unknown)
for cc in known: out.send(mido.Message("control_change", channel=0, control=cc, value=0))
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)

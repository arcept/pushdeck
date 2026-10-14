"""Column sweep: records ALL pressed buttons in order (named ones too). Usage: push_column_sweep.py <count> <out.json>"""
import json, sys, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

goal = int(sys.argv[1]); outfile = sys.argv[2]
names = json.load(open("../button_names.json"))["locked"]
reg = json.load(open("../push2_registry.json"))["buttons"]
known = set(range(20, 28)) | set(range(36, 44)) | set(range(102, 110)) | {int(k) for k in reg["rgb"]["named"]} | set(reg["white_only"])
ENC = {14, 15} | set(range(71, 80))
out = mido.open_output("Ableton Push 2 User Port"); inp = mido.open_input("Ableton Push 2 User Port")
sp = lambda v: [v & 0x7F, v >> 7]
ph.sysex(out, [0x0A, 0x02]); time.sleep(0.3)
ph.sysex(out, [3, 100] + sp(255) * 4); ph.sysex(out, [3, 101] + sp(110) * 4); ph.sysex(out, [5])
for cc in known: out.send(mido.Message("control_change", channel=0, control=cc, value=100))
dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)

seq, last_press = [], time.time()
def draw():
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
    d.text((20, 4), f"SWEEP  {len(seq)} / {goal}", font=ph.font(38), fill=(255, 255, 255))
    if seq:
        n = names.get(str(seq[-1]))
        d.text((20, 56), f"#{len(seq)}  " + (n if n else "(new - no name yet)"), font=ph.font(44), fill=(255, 255, 255) if n else (255, 120, 0))
        d.text((20, 120), f"CC {seq[-1]}     order: " + " ".join(map(str, seq[-12:])), font=ph.font(22), fill=(200, 200, 200))
    else:
        d.text((20, 70), "press the first button", font=ph.font(32), fill=(130, 130, 130))
    ph.send_frame(dev, img)

print("Lit. Sweep in your order.", flush=True)
while len(seq) < goal and time.time() - last_press < 120:
    for m in inp.iter_pending():
        if m.type == "control_change" and m.value > 0 and m.control not in ENC and m.control not in seq:
            seq.append(m.control); last_press = time.time()
            out.send(mido.Message("control_change", channel=0, control=m.control, value=101))
            print(f"#{len(seq):2d}  CC {m.control:3d}  {names.get(str(m.control), '(new)')}", flush=True)
            json.dump(seq, open(outfile, "w"))
    draw(); time.sleep(0.02)
json.dump(seq, open(outfile, "w"))
for cc in known: out.send(mido.Message("control_change", channel=0, control=cc, value=0))
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)

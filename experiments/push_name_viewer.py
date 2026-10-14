"""Show the name of the pressed button on the Push display. Usage: push_name_viewer.py [seconds]"""
import json, sys, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

names = json.load(open("../button_names.json"))["locked"]
secs = float(sys.argv[1]) if len(sys.argv) > 1 else 90
ENC = {14, 15} | set(range(71, 80))
out = mido.open_output("Ableton Push 2 User Port")
inp = mido.open_input("Ableton Push 2 User Port")
sp = lambda v: [v & 0x7F, v >> 7]
ph.sysex(out, [0x0A, 0x02]); time.sleep(0.3)
ph.sysex(out, [3, 100] + sp(255) * 4); ph.sysex(out, [5])
dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)

cur, held = None, set()
def draw():
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
    if cur is None:
        d.text((40, 55), "Press a button", font=ph.font(48), fill=(130, 130, 130))
    else:
        n = names.get(str(cur))
        d.text((40, 20), n if n else "(no name yet)", font=ph.font(72), fill=(255, 255, 255) if n else (255, 120, 0))
        d.text((40, 115), f"CC {cur}" + ("   HELD" if cur in held else ""), font=ph.font(32), fill=(255, 220, 0))
    ph.send_frame(dev, img)

end = time.time() + secs
while time.time() < end:
    for m in inp.iter_pending():
        if m.type == "control_change" and m.control not in ENC:
            if m.value > 0:
                cur = m.control; held.add(m.control)
                out.send(mido.Message("control_change", channel=0, control=m.control, value=100))
                print(f"CC {m.control:3d}  {names.get(str(m.control), '(no name yet)')}", flush=True)
            else:
                held.discard(m.control)
                out.send(mido.Message("control_change", channel=0, control=m.control, value=0))
    draw(); time.sleep(0.02)
for cc in range(128): out.send(mido.Message("control_change", channel=0, control=cc, value=0))
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)

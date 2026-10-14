"""Cycle every button through red, green, blue, white to find which LEDs are RGB."""
import json, time, mido

buttons = [int(k) for k in json.load(open("buttons_seen.json"))
           if int(k) not in (14, 15) and not 71 <= int(k) <= 79]  # skip encoders
out = mido.open_output("Ableton Push 2 User Port")
out.send(mido.Message("sysex", data=[0, 0x21, 0x1D, 1, 1, 0x0A, 2]))
time.sleep(0.3)

def entry(idx, r, g, b, w):
    sp = lambda v: [v & 0x7F, v >> 7]
    out.send(mido.Message("sysex", data=[0, 0x21, 0x1D, 1, 1, 3, idx] + sp(r) + sp(g) + sp(b) + sp(w)))

steps = [("RED", 120, (255, 0, 0, 0)), ("GREEN", 121, (0, 255, 0, 0)),
         ("BLUE", 122, (0, 0, 255, 0)), ("WHITE", 123, (255, 255, 255, 255))]
for _, idx, c in steps:
    entry(idx, *c)
out.send(mido.Message("sysex", data=[0, 0x21, 0x1D, 1, 1, 5]))

for name, idx, _ in steps:
    print(name, flush=True)
    for cc in buttons:
        out.send(mido.Message("control_change", channel=0, control=cc, value=idx))
    time.sleep(3)
for cc in buttons:
    out.send(mido.Message("control_change", channel=0, control=cc, value=0))
print("done")

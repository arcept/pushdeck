"""Light every Push 2 button, then map buttons by listening while you press them."""
import json
import sys
import time

import mido

LISTEN_SECONDS = float(sys.argv[1]) if len(sys.argv) > 1 else 60
WHITE = 127  # bright white in the default palette

out = mido.open_output("Ableton Push 2 User Port")
for port in (out, mido.open_output("Ableton Push 2 Live Port")):
    port.send(mido.Message("sysex", data=[0x00, 0x21, 0x1D, 0x01, 0x01, 0x0A, 0x02]))  # dual mode
time.sleep(0.3)

# Phase 1: blind light-up of every CC number
for cc in range(1, 128):
    out.send(mido.Message("control_change", channel=0, control=cc, value=WHITE))
print("Phase 1: all button CCs lit. Holding 8s...", flush=True)
time.sleep(8)
for cc in range(1, 128):
    out.send(mido.Message("control_change", channel=0, control=cc, value=0))

# Phase 2: press-to-light mapper
print(f"Phase 2: press buttons / touch encoders for {LISTEN_SECONDS:.0f}s...", flush=True)
seen = {}
inp = mido.open_input("Ableton Push 2 User Port")
inp2 = mido.open_input("Ableton Push 2 Live Port")
end = time.time() + LISTEN_SECONDS
while time.time() < end:
    for port, name in ((inp, "user"), (inp2, "live")):
        for m in port.iter_pending():
            if m.type == "control_change":
                if m.value > 0:
                    out.send(mido.Message("control_change", channel=0, control=m.control, value=WHITE))
                    if m.control not in seen:
                        seen[m.control] = name
                        print(f"  button CC {m.control:3d}  (port: {name})", flush=True)
                else:
                    out.send(mido.Message("control_change", channel=0, control=m.control, value=0))
            elif m.type == "note_on" and m.note < 36 and m.velocity > 0:
                print(f"  touch  note {m.note:3d}  (port: {name})", flush=True)
    time.sleep(0.005)

for cc in range(1, 128):
    out.send(mido.Message("control_change", channel=0, control=cc, value=0))
json.dump({str(k): v for k, v in sorted(seen.items())}, open("buttons_seen.json", "w"), indent=2)
print("Done. Buttons seen:", sorted(seen))

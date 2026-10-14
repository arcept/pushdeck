"""Guided encoder check: the Mac says a name, you touch+turn that encoder, we record only that window."""
import subprocess, time, mido
names = ["Tempo", "Swing"] + [f"Encoder {i}" for i in range(1, 9)] + ["Master"]
inp = mido.open_input("Ableton Push 2 User Port")
subprocess.run(["say", "Encoder check starting. Touch and turn each encoder when I say its name."])
time.sleep(4)
for n in names:
    for _ in inp.iter_pending(): pass          # drop anything from before this window
    subprocess.run(["say", n])
    touches, ccs, vals, end = set(), set(), [], time.time() + 6
    while time.time() < end:
        for m in inp.iter_pending():
            if m.type == "note_on" and m.note <= 10 and m.velocity > 0: touches.add(m.note)
            elif m.type == "control_change" and (m.control in (14, 15) or 71 <= m.control <= 79):
                ccs.add(m.control); vals.append(m.value)
        time.sleep(0.003)
    print(f"{n:10s} touch={sorted(touches)}  rotation CC={sorted(ccs)}  events={len(vals)}", flush=True)
subprocess.run(["say", "Done"])

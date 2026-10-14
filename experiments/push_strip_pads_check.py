"""Guided touch strip + pad pressure check. The Mac speaks each step; we summarise what arrived."""
import subprocess, time, mido

STEPS = [
    ("strip", "Rest one finger on the touch strip, without moving. Then lift.", 6),
    ("strip", "Slide slowly from the bottom of the touch strip to the top.", 7),
    ("strip", "Slide quickly from the top of the touch strip to the bottom.", 6),
    ("strip", "Tap the touch strip once, in the middle.", 6),
    ("pads", "Press any pad lightly, then let go.", 6),
    ("pads", "Press any pad hard, then let go.", 6),
    ("pads", "Press and hold one pad, then press harder and harder without lifting.", 9),
    ("pads", "Press two different pads and hold them. Then press only one of them harder.", 10),
]

def say(t): subprocess.run(["say", t])

inp = mido.open_input("Ableton Push 2 User Port")
say("Touch strip and pad check starting. Follow my instructions.")
time.sleep(3)
for kind, text, secs in STEPS:
    for _ in inp.iter_pending(): pass
    say(text)
    end = time.time() + secs
    s = {"n12": [], "pb": [], "cc": {}, "pads": {}, "poly": [], "chan": [], "other": {}}
    while time.time() < end:
        for m in inp.iter_pending():
            if m.type == "pitchwheel": s["pb"].append(m.pitch)
            elif m.type in ("note_on", "note_off") and m.note == 12: s["n12"].append(m.type + ("" if m.type=="note_off" else f"/{m.velocity}"))
            elif m.type in ("note_on", "note_off") and 36 <= m.note <= 99:
                if m.type == "note_on" and m.velocity > 0: s["pads"].setdefault(m.note, []).append(m.velocity)
            elif m.type == "polytouch": s["poly"].append((m.note, m.value))
            elif m.type == "aftertouch": s["chan"].append(m.value)
            elif m.type == "control_change": s["cc"][m.control] = s["cc"].get(m.control, 0) + 1
            elif m.type not in ("clock", "active_sensing"): s["other"][m.type] = s["other"].get(m.type, 0) + 1
        time.sleep(0.002)
    print(f"\n[{kind}] {text}")
    if kind == "strip":
        pb = s["pb"]
        print(f"  note12 touch events: {s['n12'][:6]}")
        print(f"  pitchbend: {len(pb)} msgs" + (f", range {min(pb)}..{max(pb)}, first {pb[0]}, last {pb[-1]}" if pb else ""))
        print(f"  CC messages: {s['cc']}  other: {s['other']}")
    else:
        print(f"  pad note-ons (note: velocities): {s['pads']}")
        print(f"  polyphonic aftertouch: {len(s['poly'])} msgs" + (f", max {max(v for _, v in s['poly'])}, notes {sorted({n for n, _ in s['poly']})}" if s['poly'] else ""))
        print(f"  channel pressure: {len(s['chan'])} msgs" + (f", max {max(s['chan'])}" if s['chan'] else ""))
        print(f"  CC: {s['cc']}  other: {s['other']}")
say("Done. Thank you.")

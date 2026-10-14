"""Pressure diagnostic: 3 voice-guided stages, live numbers on the Push display, both MIDI ports watched."""
import subprocess, time
import mido, usb.core, usb.util
from PIL import Image, ImageDraw
import push_hello as ph

STAGES = [
    ("1  CHANNEL pressure", 0, "Stage one. Channel mode. Press and hold one pad with a fingertip, then push down harder and harder without lifting."),
    ("2  POLY pressure",    1, "Stage two. Per pad mode. Press and hold one pad, then push down harder and harder without lifting."),
    ("3  POLY, deep press", 1, "Stage three. Use the flat of your finger on the middle of a pad and press as hard as you comfortably can."),
]
SECS = 14
user = mido.open_input("Ableton Push 2 User Port")
live = mido.open_input("Ableton Push 2 Live Port")
out = mido.open_output("Ableton Push 2 User Port")
sp = lambda v: [v & 0x7F, v >> 7]
ph.sysex(out, [0x0A, 0x02]); ph.sysex(out, [3, 100] + sp(255) * 4); ph.sysex(out, [5])

dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
dev.set_configuration(); usb.util.claim_interface(dev, 0)
f, fb = ph.font(22), ph.font(30)
summary = []

def draw(title, left, vel, now, peak, counts, lastmsg):
    img = Image.new("RGB", (ph.W, ph.H), (0, 0, 0)); d = ImageDraw.Draw(img)
    d.text((20, 2), f"STAGE {title}", font=fb, fill=(255, 255, 255)); d.text((800, 6), f"{left:4.1f}s", font=f, fill=(255, 220, 0))
    d.text((20, 44), f"Velocity {vel:3d}", font=f, fill=(255, 220, 0))
    d.text((220, 44), f"Pressure now {now:3d}", font=f, fill=(255, 220, 0)); d.text((520, 44), f"PEAK {peak:3d} / 127", font=f, fill=(255, 220, 0))
    d.rectangle([20, 76, 940, 92], outline=(110, 110, 110)); d.rectangle([20, 76, 20 + int(920 * peak / 127), 92], fill=(255, 255, 255))
    d.text((20, 100), "user port:  notes %d  chan-pressure %d  poly %d   |   live port:  chan %d  poly %d" % (
        counts["user"]["note"], counts["user"]["aftertouch"], counts["user"]["polytouch"],
        counts["live"]["aftertouch"], counts["live"]["polytouch"]), font=ph.font(20), fill=(200, 200, 200))
    d.text((20, 130), "last: " + lastmsg[:70], font=ph.font(20), fill=(150, 150, 150))
    return img

for title, mode, speech in STAGES:
    ph.sysex(out, [0x1E, mode])                                   # aftertouch mode: 0 channel, 1 poly (per spec, unverified here)
    voice = subprocess.Popen(["say", speech])
    counts = {p: {"note": 0, "aftertouch": 0, "polytouch": 0, "other": 0} for p in ("user", "live")}
    vel = now = peak = 0; lastmsg = "(waiting)"; held = set(); maxes = {"aftertouch": 0, "polytouch": 0}
    end = time.time() + SECS
    for _ in user.iter_pending(): pass
    for _ in live.iter_pending(): pass
    while time.time() < end:
        for pname, port in (("user", user), ("live", live)):
            for m in port.iter_pending():
                if m.type in ("clock", "active_sensing"): continue
                lastmsg = f"{pname}: {m}"
                if m.type in ("note_on", "note_off"):
                    if 36 <= m.note <= 99 and pname == "user":
                        counts[pname]["note"] += 1
                        if m.type == "note_on" and m.velocity > 0:
                            vel = m.velocity; held.add(m.note); now = 0
                            out.send(mido.Message("note_on", channel=0, note=m.note, velocity=100))
                        else:
                            held.discard(m.note); now = 0
                            out.send(mido.Message("note_on", channel=0, note=m.note, velocity=0))
                elif m.type in ("aftertouch", "polytouch"):
                    counts[pname][m.type] += 1; now = m.value; peak = max(peak, m.value)
                    maxes[m.type] = max(maxes[m.type], m.value)
                else:
                    counts[pname]["other"] += 1
        ph.send_frame(dev, draw(title, end - time.time(), vel, now, peak, counts, lastmsg)); time.sleep(0.02)
    voice.wait()
    for n in list(held): out.send(mido.Message("note_on", channel=0, note=n, velocity=0))
    summary.append((title, counts, maxes))

ph.sysex(out, [0x1E, 0])                                          # back to channel mode
subprocess.run(["say", "Done."])
for title, counts, maxes in summary:
    print(f"\nSTAGE {title}")
    for p in ("user", "live"):
        c = counts[p]; print(f"  {p}: notes={c['note']} chan-pressure={c['aftertouch']} poly-pressure={c['polytouch']} other={c['other']}")
    print(f"  max chan-pressure={maxes['aftertouch']}  max poly-pressure={maxes['polytouch']}")
ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H), (0, 0, 0)))
usb.util.dispose_resources(dev)

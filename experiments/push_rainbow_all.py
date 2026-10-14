"""Connection check + rainbow on every pad, button, touch-strip LED and the display."""
import colorsys
import sys
import time

import mido
import usb.core
import usb.util
from PIL import Image, ImageDraw

import push_hello as ph

HOLD = float(sys.argv[1]) if len(sys.argv) > 1 else 10
RGB_BUTTONS = list(range(20, 28)) + list(range(102, 110)) + list(range(36, 44)) + [60, 61, 29, 85, 86, 89]
WHITE_BUTTONS = [3, 9, 28, 35, 44, 45, 46, 47, 87, 88, 90, 110, 111, 112, 113, 116, 117, 118, 119,
                 30, 31, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63]


def entry(out, idx, r, g, b, w=0):
    s = lambda v: [v & 0x7F, v >> 7]
    ph.sysex(out, [0x03, idx] + s(r) + s(g) + s(b) + s(w))


def main():
    ins, outs = mido.get_input_names(), mido.get_output_names()
    print("MIDI ports:", [p for p in outs if "Push" in p])
    dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
    print("USB display:", "found" if dev else "NOT FOUND")
    out = mido.open_output("Ableton Push 2 User Port")
    ph.sysex(out, [0x0A, 0x02])
    time.sleep(0.3)
    ph.rainbow(out)  # pads: palette 1-64
    for i, cc in enumerate(RGB_BUTTONS):
        r, g, b = [int(c * 255) for c in colorsys.hsv_to_rgb(i / len(RGB_BUTTONS), 1, 1)]
        entry(out, 65 + i, r, g, b)
        out.send(mido.Message("control_change", channel=0, control=cc, value=65 + i))
    entry(out, 100, 255, 255, 255, 255)
    ph.sysex(out, [0x05])
    for cc in WHITE_BUTTONS:
        out.send(mido.Message("control_change", channel=0, control=cc, value=100))
    # touch strip: host-controlled LEDs, all on
    ph.sysex(out, [0x17, 0x63])
    ph.sysex(out, [0x19] + [0x3F | (7 << 3) & 0x7F if False else (7 | (7 << 3))] * 15 + [7])
    print(f"Lit {64} pads, {len(RGB_BUTTONS)} RGB + {len(WHITE_BUTTONS)} white buttons, strip.")
    if dev:
        dev.set_configuration()
        usb.util.claim_interface(dev, 0)
        end, t0 = time.time() + HOLD, time.time()
        while time.time() < end:
            img = Image.new("RGB", (ph.W, ph.H))
            px = img.load()
            off = (time.time() - t0) * 0.3
            for x in range(ph.W):
                c = tuple(int(v * 255) for v in colorsys.hsv_to_rgb((x / ph.W + off) % 1, 1, 1))
                for y in range(ph.H):
                    px[x, y] = c
            ImageDraw.Draw(img).text((380, 60), "PUSH 2 ONLINE", font=ph.font(48), fill=(0, 0, 0))
            ph.send_frame(dev, img)
        ph.send_frame(dev, Image.new("RGB", (ph.W, ph.H)))
        usb.util.dispose_resources(dev)
    ph.sysex(out, [0x17, 0x68])
    ph.clear_pads(out)
    for cc in RGB_BUTTONS + WHITE_BUTTONS:
        out.send(mido.Message("control_change", channel=0, control=cc, value=0))
    out.close()
    print("Done.")


main()

"""Push 2 hello: rainbow across the pads + text on the display, no Ableton needed."""
import colorsys
import sys
import time

import mido
import numpy as np
import usb.core
import usb.util
from PIL import Image, ImageDraw, ImageFont

HOLD_SECONDS = float(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].replace(".", "").isdigit() else 15


# ---------- pads ----------
def sysex(out, data):
    out.send(mido.Message("sysex", data=[0x00, 0x21, 0x1D, 0x01, 0x01] + data))


def set_palette_entry(out, idx, r, g, b):
    def split(v):
        return [v & 0x7F, v >> 7]
    sysex(out, [0x03, idx] + split(r) + split(g) + split(b) + split(0))


def rainbow(out):
    # pads are notes 36 (bottom-left) .. 99 (top-right); 8 per row
    for i in range(64):
        row, col = divmod(i, 8)
        hue = ((col + row) % 8) / 8.0 + row * 0.02
        r, g, b = [int(c * 255) for c in colorsys.hsv_to_rgb(hue % 1.0, 1.0, 1.0)]
        set_palette_entry(out, i + 1, r, g, b)  # palette index 0 stays black
    sysex(out, [0x05])  # reapply palette
    for i in range(64):
        out.send(mido.Message("note_on", channel=0, note=36 + i, velocity=i + 1))


def clear_pads(out):
    for i in range(64):
        out.send(mido.Message("note_on", channel=0, note=36 + i, velocity=0))


# ---------- display ----------
W, H = 960, 160
MASK = np.tile(np.array([0xE7, 0xF3, 0xE7, 0xFF], dtype=np.uint8), 16384 // 4)


def to_frame(img):
    a = np.asarray(img.convert("RGB"), dtype=np.uint16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    px = ((b & 0xF8) << 8) | ((g & 0xFC) << 3) | ((r & 0xF8) >> 3)  # RGB565 as Push expects
    rows = np.zeros((H, 1024), dtype=np.uint16)  # 2048 bytes per line, 128 filler
    rows[:, :W] = px
    return rows.astype("<u2").tobytes()


def send_frame(dev, img):
    dev.write(0x01, bytes([0xFF, 0xCC, 0xAA, 0x88] + [0] * 12), 1000)
    data = np.frombuffer(to_frame(img), dtype=np.uint8)
    for off in range(0, len(data), 16384):
        chunk = (data[off:off + 16384] ^ MASK).tobytes()
        dev.write(0x01, chunk, 1000)


def font(size):
    for path in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/SFNS.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def hello_image():
    img = Image.new("RGB", (W, H), (12, 12, 16))
    d = ImageDraw.Draw(img)
    d.text((40, 20), "Hello, Push 2", font=font(64), fill=(255, 255, 255))
    d.text((40, 100), "driven from Python, no Ableton", font=font(30), fill=(150, 150, 160))
    # colour check: pure red / green / blue blocks
    for i, c in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255)]):
        d.rectangle([760 + i * 60, 20, 810 + i * 60, 70], fill=c)
    return img


def main():
    out = mido.open_output("Ableton Push 2 User Port")
    live = mido.open_output("Ableton Push 2 Live Port")
    sysex(live, [0x0A, 0x02])  # MIDI mode: 0=live, 1=user, 2=dual
    sysex(out, [0x0A, 0x02])
    time.sleep(0.3)
    rainbow(out)   # palette + pads via User Port
    rainbow(live)  # and via Live Port, to see which one the device honours
    print("Pads lit (sent on both ports).")

    dev = usb.core.find(idVendor=0x2982, idProduct=0x1967)
    if dev is None:
        print("Push 2 not found on USB")
    else:
        dev.set_configuration()
        usb.util.claim_interface(dev, 0)
        img = hello_image()
        end = time.time() + HOLD_SECONDS
        while time.time() < end:  # the display blanks if frames stop, so keep sending
            send_frame(dev, img)
            time.sleep(0.05)
        send_frame(dev, Image.new("RGB", (W, H), (0, 0, 0)))
        usb.util.dispose_resources(dev)
    clear_pads(out)
    out.close()
    print("Done.")


if __name__ == "__main__":
    main()

"""Push 2 hardware layer: MIDI in/out, LED palette, display frames, hotplug status."""
import asyncio
import threading
import time

import mido
import numpy as np
import usb.core
import usb.util
from PIL import Image

from . import color
from . import registry as R

W, H = 960, 160
VID, PID = 0x2982, 0x1967
USER_PORT, LIVE_PORT = "Ableton Push 2 User Port", "Ableton Push 2 Live Port"
MASK = np.tile(np.array([0xE7, 0xF3, 0xE7, 0xFF], dtype=np.uint8), 16384 // 4)
HEADER = bytes([0xFF, 0xCC, 0xAA, 0x88] + [0] * 12)


def to_frame(img: Image.Image, calibrate: bool = True) -> bytes:
    rgb = np.asarray(img.convert("RGB"))
    if calibrate and not color.is_identity():
        rgb = color.apply(rgb)
    a = rgb.astype(np.uint16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    px = ((b & 0xF8) << 8) | ((g & 0xFC) << 3) | ((r & 0xF8) >> 3)
    rows = np.zeros((H, 1024), dtype=np.uint16)
    rows[:, :W] = px
    return rows.astype("<u2").tobytes()


class Push:
    """Owns the device. Thread-safe LED/display setters; input events delivered on the asyncio loop."""

    def __init__(self, loop: asyncio.AbstractEventLoop, on_event, on_status):
        self.loop, self.on_event, self.on_status = loop, on_event, on_status
        self.out = self.inp = self.dev = None
        self.lock = threading.RLock()
        self.palette: dict[tuple, int] = {}
        self.led_state: dict[str, tuple] = {}
        self.frame: Image.Image = Image.new("RGB", (W, H))
        self.frame_ref = None
        self.display_on = True
        self.raw = False  # True while a calibration test shows uncorrected colours
        self.status = {"usb": False, "midi": False}
        self._stop = False
        threading.Thread(target=self._watch, daemon=True).start()
        threading.Thread(target=self._display_loop, daemon=True).start()

    # ---------- connection ----------
    def _watch(self):
        while not self._stop:
            usb_ok = usb.core.find(idVendor=VID, idProduct=PID) is not None
            midi_ok = USER_PORT in mido.get_output_names()
            if usb_ok and midi_ok and self.out is None:
                self._connect()
            elif not (usb_ok and midi_ok) and self.out is not None:
                self._disconnect()
            new = {"usb": usb_ok, "midi": midi_ok}
            if new != self.status:
                self.status = new
                self.loop.call_soon_threadsafe(self.on_status, dict(new))
            time.sleep(1.0)

    def _connect(self):
        with self.lock:
            try:
                self.out = mido.open_output(USER_PORT)
                self.inp = mido.open_input(USER_PORT, callback=self._midi_in)
                self.sysex([0x0A, 0x02])  # Dual mode, or pads stay dark
                time.sleep(0.3)
                self.sysex([0x1E, 0x01])  # polyphonic aftertouch
                self.palette.clear()
                self.led_state.clear()
                self.clear_leds(force=True)  # start from a known state, whatever a previous run left lit
                self.set_strip([0] * 31)
                self.dev = usb.core.find(idVendor=VID, idProduct=PID)
                self.dev.set_configuration()
                usb.util.claim_interface(self.dev, 0)
            except Exception as exc:  # noqa: BLE001
                print("connect failed:", exc)
                self._disconnect()

    def _disconnect(self):
        with self.lock:
            for h in (self.inp, self.out):
                try:
                    h and h.close()
                except Exception:  # noqa: BLE001
                    pass
            if self.dev is not None:
                try:
                    usb.util.dispose_resources(self.dev)
                except Exception:  # noqa: BLE001
                    pass
            self.out = self.inp = self.dev = None

    @property
    def connected(self) -> bool:
        return self.out is not None

    # ---------- input ----------
    def _midi_in(self, m: mido.Message):
        ev = None
        if m.type in ("note_on", "note_off"):
            on = m.type == "note_on" and m.velocity > 0
            if m.note in R.PAD_BY_NOTE:
                ev = {"control": R.PAD_BY_NOTE[m.note], "kind": "press" if on else "release", "value": m.velocity}
            elif m.note in R.KNOB_BY_TOUCH:
                ev = {"control": R.KNOB_BY_TOUCH[m.note], "kind": "touch" if on else "untouch", "value": 1 if on else 0}
            elif m.note == 12:
                ev = {"control": "touch-strip", "kind": "touch" if on else "untouch", "value": 1 if on else 0}
        elif m.type == "control_change":
            if m.control in R.BTN_BY_CC:
                ev = {"control": R.BTN_BY_CC[m.control], "kind": "press" if m.value else "release", "value": m.value}
            elif m.control in R.KNOB_BY_CC:
                step = m.value if m.value < 64 else m.value - 128
                ev = {"control": R.KNOB_BY_CC[m.control], "kind": "turn", "value": step}
        elif m.type == "pitchwheel":
            ev = {"control": "touch-strip", "kind": "move", "value": m.pitch}
        if ev:
            self.loop.call_soon_threadsafe(self.on_event, ev)

    # ---------- output ----------
    def sysex(self, data):
        with self.lock:
            if self.out:
                self.out.send(mido.Message("sysex", data=[0x00, 0x21, 0x1D, 0x01, 0x01] + data))

    def _entry(self, rgb, white) -> int:
        key = (*rgb, white)
        if key in self.palette:
            return self.palette[key]
        if len(self.palette) >= 120:
            self.palette.clear()
            self.led_state.clear()
        idx = len(self.palette) + 1
        self.palette[key] = idx
        s = lambda v: [v & 0x7F, v >> 7]  # noqa: E731
        self.sysex([0x03, idx] + s(rgb[0]) + s(rgb[1]) + s(rgb[2]) + s(white))
        self.sysex([0x05])
        return idx

    def set_led(self, control: str, color):
        """color: (r,g,b) 0-255 or None for off. White-only buttons use luminance as white level."""
        c = R.CONTROLS.get(control)
        if not c or "led" not in c or not self.out:
            return
        if self.led_state.get(control) == color:
            return
        self.led_state[control] = color
        if color is None or color == (0, 0, 0):
            idx = 0
        elif c["led"] == "white":
            w = max(color)
            idx = self._entry((w, w, w), w)
        else:
            idx = self._entry(tuple(color), 0)
        with self.lock:
            if self.out is None:   # the connection can drop (or fail to open) between the check above and here
                return
            if c["kind"] == "pad":
                self.out.send(mido.Message("note_on", channel=0, note=c["note"], velocity=idx))
            else:
                self.out.send(mido.Message("control_change", channel=0, control=c["cc"], value=idx))

    def clear_leds(self, force: bool = False):
        """Switch every pad/button LED off. force=True sends 'off' to all of them even if our cache says they already
        are (LEDs left lit by an earlier daemon run are not in the cache)."""
        for cid, c in R.CONTROLS.items():
            if "led" not in c:
                continue
            if force and self.out:
                self.led_state[cid] = None
                with self.lock:
                    if self.out is None:
                        return
                    if c["kind"] == "pad":
                        self.out.send(mido.Message("note_on", channel=0, note=c["note"], velocity=0))
                    else:
                        self.out.send(mido.Message("control_change", channel=0, control=c["cc"], value=0))
            else:
                self.set_led(cid, None)

    def set_strip(self, levels):
        """31 values 0-7 (bottom to top)."""
        self.sysex([0x17, 0x63])
        lv = list(levels) + [0] * (31 - len(levels))
        data = [lv[2 * i] | (lv[2 * i + 1] << 3) for i in range(15)] + [lv[30]]
        self.sysex([0x19] + data)

    def set_frame(self, img: Image.Image):
        self.frame = img

    # ---------- display ----------
    def _display_loop(self):
        sent_for, sent = None, None   # the frame that was last converted, and its bytes: an unchanged picture is not converted again
        while not self._stop:
            t0 = time.time()
            with self.lock:
                dev = self.dev
                if dev is not None:
                    try:
                        img = self.frame if self.display_on else Image.new("RGB", (W, H))
                        dev.write(0x01, HEADER, 1000)
                        key = (id(img), not self.raw)
                        if key != sent_for or img is not self.frame_ref:
                            raw = np.frombuffer(to_frame(img, not self.raw), dtype=np.uint8)
                            sent, sent_for, self.frame_ref = [(raw[o:o + 16384] ^ MASK).tobytes() for o in range(0, len(raw), 16384)], key, img
                        for chunk in sent:
                            dev.write(0x01, chunk, 1000)
                    except Exception:  # noqa: BLE001  (unplugged mid-frame; watcher will reconnect)
                        pass
            time.sleep(max(0.0, 1 / 30 - (time.time() - t0)))

"""System audio -> spectrum. Runs the audiotap helper (Core Audio process tap, macOS 14.2+) and turns its mono samples into
32 log-spaced bands and a short waveform. If the helper can't run, the hub falls back to a gentle synthetic animation."""
from __future__ import annotations

import asyncio
import math
import os
import shutil
import struct
import subprocess
import time
from pathlib import Path

import numpy as np

from ..registry import ROOT

DIR = ROOT / "daemon" / "audiotap"
SRC, APP = DIR / "audiotap.swift", DIR / "PushAudioTap.app"
N, BANDS, WAVE = 1024, 32, 96


class AudioTap:
    def __init__(self):
        self.status = "off"      # off | starting | waiting | ok | unavailable | error
        self.message = ""
        self.bars = [0.0] * BANDS
        self.wave = [0.0] * WAVE
        self.level = 0.0
        self.last_frame = 0.0
        self._proc = None
        self._task = None
        self._peak = 1e-4
        self._edges = None
        self._win = np.hanning(N).astype(np.float32)

    # ---------- lifecycle ----------
    def start(self):
        if self._task is None or self._task.done():
            self.status, self.message = "starting", ""
            self._task = asyncio.ensure_future(self._run())

    def stop(self):
        if self._task:
            self._task.cancel()
            self._task = None
        self._kill()
        self.status = "off"
        self.bars, self.wave, self.level = [0.0] * BANDS, [0.0] * WAVE, 0.0

    @staticmethod
    def _kill():
        subprocess.run(["pkill", "-f", str(APP / "Contents/MacOS/audiotap")], check=False)

    @property
    def live(self) -> bool:
        return self.status == "ok" and time.time() - self.last_frame < 1.0

    async def _build(self) -> bool:
        exe = APP / "Contents" / "MacOS" / "audiotap"
        if exe.exists() and exe.stat().st_mtime >= SRC.stat().st_mtime:
            return True
        if not shutil.which("swiftc"):
            self.status, self.message = "unavailable", "Install the Xcode command line tools (xcode-select --install) so the audio helper can be built"
            return False
        exe.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(DIR / "Info.plist", APP / "Contents" / "Info.plist")
        p = await asyncio.create_subprocess_exec("swiftc", "-O", str(SRC), "-o", str(exe), stdout=asyncio.subprocess.DEVNULL,
                                                 stderr=asyncio.subprocess.PIPE)
        _, err = await p.communicate()
        if p.returncode != 0:
            self.status, self.message = "unavailable", "The audio helper did not build: " + err.decode(errors="replace")[-200:]
            return False
        await (await asyncio.create_subprocess_exec("codesign", "--force", "--sign", "-", str(APP))).wait()  # ad-hoc: gives the app its own identity
        return True

    async def _run(self):
        fifo = f"/tmp/push2-audiotap-{os.getpid()}.fifo"
        errf = Path(f"/tmp/push2-audiotap-{os.getpid()}.err")
        keep = None
        try:
            if not await self._build():
                return
            self._kill()
            if os.path.exists(fifo):
                os.unlink(fifo)
            os.mkfifo(fifo)
            rfd = os.open(fifo, os.O_RDONLY | os.O_NONBLOCK)
            keep = os.open(fifo, os.O_WRONLY | os.O_NONBLOCK)  # a writer of our own, so the reader never sees end-of-file
            errf.write_text("")
            reader = asyncio.StreamReader()
            loop = asyncio.get_running_loop()
            await loop.connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), os.fdopen(rfd, "rb", buffering=0))
            await (await asyncio.create_subprocess_exec("open", "-g", "-j", "-a", str(APP), "--stderr", str(errf), "--args", fifo)).wait()
            self.status = "waiting"
            self.message = "Waiting for macOS to allow System Audio Recording"
            hdr = await reader.readexactly(4)
            rate = struct.unpack("<I", hdr)[0] or 48000
            self._edges = self._band_edges(rate)
            self.status, self.message = "ok", ""
            while True:
                raw = await reader.readexactly(N * 4)
                self._frame(np.frombuffer(raw, dtype="<f4"))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            err = errf.read_text().strip() if errf.exists() else ""
            self.status, self.message = "error", err or str(exc) or "The audio helper stopped"
        finally:
            if keep is not None:
                os.close(keep)
            for f in (fifo,):
                try:
                    os.unlink(f)
                except OSError:
                    pass

    # ---------- analysis ----------
    @staticmethod
    def _band_edges(rate):
        lo, hi = 45.0, min(15000.0, rate / 2 - 100)
        f = np.geomspace(lo, hi, BANDS + 1)
        return np.clip((f / (rate / N)).round().astype(int), 1, N // 2)

    def _frame(self, x):
        self.last_frame = time.time()
        rms = float(np.sqrt(np.mean(x * x)))
        self.level = rms
        spec = np.abs(np.fft.rfft(x * self._win)) / N
        e = self._edges
        out = np.empty(BANDS, dtype=np.float32)
        for i in range(BANDS):
            a, b = e[i], max(e[i + 1], e[i] + 1)
            out[i] = spec[a:b].max() * (1 + i * 0.09)  # a gentle treble tilt: highs carry less energy than bass
        peak = float(out.max())
        self._peak = max(peak, self._peak * 0.994, 3e-4)
        v = np.clip(out / self._peak, 0, 1) ** 0.8
        if rms < 1e-4:
            v *= 0
        old = np.asarray(self.bars, dtype=np.float32)
        self.bars = np.where(v > old, old + (v - old) * 0.65, old + (v - old) * 0.22).tolist()
        idx = np.linspace(0, N - 1, WAVE).astype(int)
        w = x[idx]
        scale = max(float(np.abs(w).max()), 0.05)
        self.wave = np.clip(w / scale, -1, 1).tolist() if rms >= 1e-4 else [0.0] * WAVE

    def synthetic(self, t, playing):
        """Used while real audio isn't available: a soft, slow animation so the visualizer isn't dead."""
        amp = 0.55 if playing else 0.24
        bars = [amp * (0.45 + 0.4 * math.sin(t * 2.1 + i * 0.5) * math.sin(t * 0.9 + i * 0.13) + 0.15 * math.sin(t * 5 + i)) * (1 - i / (BANDS * 1.6))
                for i in range(BANDS)]
        wave = [amp * math.sin(t * 3 + i * 0.25) * (0.6 + 0.4 * math.sin(t * 0.7 + i * 0.05)) for i in range(WAVE)]
        return [max(0.0, b) for b in bars], wave

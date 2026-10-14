"""Whatever macOS itself thinks is playing (Chrome tabs, Music, VLC, anything the media keys control), via Apple's MediaRemote.

macOS 15.4+ only lets Apple-signed processes call MediaRemote, so a tiny library (nowplaying/mr.c) is loaded into /usr/bin/perl,
which is one. Nothing leaves the Mac. If the library can't be built or Apple closes this door, `ok` stays False and the rest still works."""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parents[2] / "nowplaying"
LIB = HERE / "libmr.dylib"
PERL = ("use DynaLoader; my $h=DynaLoader::dl_load_file($ARGV[0],0) or exit 3; my $s=DynaLoader::dl_find_symbol($h,'mr_run') or exit 4; "
        "DynaLoader::dl_install_xsub('main::mr_run',$s); &mr_run(); exit 0;")
CMD = {"play": 2, "next": 4, "prev": 5}  # kMRTogglePlayPause, kMRNextTrack, kMRPreviousTrack
ART = os.path.join(tempfile.gettempdir(), "push2-nowplaying-art")


def _build() -> bool:
    src = HERE / "mr.c"
    if LIB.exists() and LIB.stat().st_mtime >= src.stat().st_mtime:
        return True
    try:
        subprocess.run(["clang", "-dynamiclib", "-fblocks", "-framework", "CoreFoundation", "-o", str(LIB), str(src)], check=True, capture_output=True, timeout=60)
        subprocess.run(["codesign", "-s", "-", "-f", str(LIB)], check=True, capture_output=True, timeout=20)
        return True
    except Exception:  # noqa: BLE001
        return False


async def _run(env_extra=None, timeout=4.0) -> dict | None:
    env = dict(os.environ, **(env_extra or {}))
    p = await asyncio.create_subprocess_exec("/usr/bin/perl", "-e", PERL, str(LIB), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env=env)
    try:
        out, _ = await asyncio.wait_for(p.communicate(), timeout)
        return json.loads(out.decode().strip().splitlines()[-1])
    except Exception:  # noqa: BLE001
        try:
            p.kill()
        except ProcessLookupError:
            pass
        return None


class SystemNowPlaying:
    def __init__(self):
        self.ok = None  # None = not tried yet

    async def info(self) -> dict | None:
        """{title, artist, album, duration, position, playing, art: bytes|None} or None when nothing is registered / unavailable."""
        if self.ok is None:
            self.ok = await asyncio.get_event_loop().run_in_executor(None, _build)
        if not self.ok:
            return None
        try:
            os.remove(ART)
        except OSError:
            pass
        d = await _run({"MR_ART": ART})
        if not d or d.get("error") or not d.get("title"):
            return None
        rate, pos = float(d.get("rate") or 0), float(d.get("elapsed") or 0)
        if d.get("playing") and rate and d.get("ts"):
            pos += max(0.0, time.time() - d["ts"]) * rate
        art = None
        if d.get("art"):
            try:
                art = Path(ART).read_bytes()
            except OSError:
                pass
        return {"title": d["title"], "artist": d.get("artist", ""), "album": d.get("album", ""), "duration": float(d.get("duration") or 0),
                "position": pos, "playing": bool(d.get("playing")), "art": art, "app": d.get("app", "")}

    async def send(self, op: str) -> bool:
        if not self.ok or op not in CMD:
            return False
        return (await _run({"MR_CMD": str(CMD[op])})) is not None

"""Shared helpers for the media package."""
from __future__ import annotations

import asyncio


async def osa(script: str, timeout=4.0) -> str:
    p = await asyncio.create_subprocess_exec("osascript", "-e", script, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(p.communicate(), timeout)
    except asyncio.TimeoutError:
        p.kill()
        raise
    if p.returncode != 0:
        raise RuntimeError(err.decode(errors="replace").strip())
    return out.decode(errors="replace").strip()

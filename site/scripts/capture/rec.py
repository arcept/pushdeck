# Records the Push 2 display stream from the dev daemon: pins each profile in turn and saves its JPEG frames.
# usage: python rec.py OUTDIR profile_id:seconds [profile_id:seconds ...]
import asyncio, json, os, sys, time
import aiohttp

async def main(out, plan):
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect("http://127.0.0.1:8472/ws", max_msg_size=0) as ws:
            hello = await ws.receive_json()
            media = dict((hello.get("settings") or {}).get("media") or {}); media["mode"] = "off"   # no music player on the display
            await ws.send_json({"type": "set_setting", "key": "media", "value": media})
            await ws.send_json({"type": "mirror", "mode": "stream"})
            for item in plan:
                pid, secs = item.split(":")
                await ws.send_json({"type": "set_profile", "id": pid})
                d = os.path.join(out, pid); os.makedirs(d, exist_ok=True)
                t0 = time.time(); n = 0; settle = 2.0
                while time.time() - t0 < settle + float(secs):
                    try:
                        m = await asyncio.wait_for(ws.receive(), 1)
                    except asyncio.TimeoutError:
                        continue
                    if m.type == aiohttp.WSMsgType.BINARY and time.time() - t0 > settle:
                        open(os.path.join(d, f"{n:04d}.jpg"), "wb").write(m.data); n += 1
                print(pid, n, "frames", flush=True)
            await ws.send_json({"type": "set_profile", "id": None})

asyncio.run(main(sys.argv[1], sys.argv[2:]))

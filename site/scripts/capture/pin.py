# usage: pin.py PROFILE_ID   (media off, then pin that profile on the dev daemon)
import asyncio, json, sys, aiohttp
async def main(pid):
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect("http://127.0.0.1:8472/ws", max_msg_size=0) as ws:
            hello = await ws.receive_json()
            media = dict((hello.get("settings") or {}).get("media") or {}); media["mode"] = "off"
            await ws.send_json({"type": "set_setting", "key": "media", "value": media})
            await ws.send_json({"type": "set_profile", "id": pid})
            await asyncio.sleep(1.5)
            print("pinned", pid, "media off")
asyncio.run(main(sys.argv[1]))

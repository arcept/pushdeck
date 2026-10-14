"""aiohttp server: /ws for the UI and menu bar app, plus the built UI from ui/dist."""
import asyncio
import json
import os

from aiohttp import WSMsgType, web

from . import apps
from .engine import Engine
from .registry import ROOT

PORT = int(os.environ.get("PUSH_PORT", 8472))  # not 8765: a common port for other local dev servers


async def ws_handler(request):
    eng: Engine = request.app["engine"]
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    eng.clients.add(ws)
    await ws.send_json(eng.hello())
    try:
        async for m in ws:
            if m.type == WSMsgType.TEXT:
                try:
                    msg = json.loads(m.data)
                    if msg.get("type") == "mirror":
                        eng.mirror[ws] = msg["mode"]
                        if msg["mode"] == "render":
                            await ws.send_json({"type": "scene", "scene": eng.scene})
                        continue
                    if msg.get("type") == "preview_scene":
                        await ws.send_json(eng.preview_scene(msg["id"]))
                        continue
                    if msg.get("type") == "preview_layout":
                        await ws.send_json(eng.preview_layout(msg["id"], msg.get("widgets")))
                        continue
                    await eng.handle(msg)
                except Exception as exc:  # noqa: BLE001
                    await ws.send_json({"type": "error", "message": str(exc)})
    finally:
        eng.clients.discard(ws)
        eng.mirror.pop(ws, None)
        if not eng.clients:
            eng.preview = False
    return ws


async def ask_hook(request):
    """The Claude Code hook (tools/push_ask_hook.py) hands a question here and waits for the answers typed on the Push."""
    eng: Engine = request.app["engine"]
    return web.json_response(await eng.asks.hook_request(await request.json()))


async def app_info(request):
    a = apps.info(request.match_info["bundle"])
    return web.json_response({"name": a["name"], "installed": a["installed"]})


async def app_icon(request):
    a = apps.info(request.match_info["bundle"])
    if not a["icon"]:
        raise web.HTTPNotFound()
    return web.Response(body=a["icon"], content_type="image/png", headers={"Cache-Control": "max-age=86400"})


async def media_icon(request):
    hit = request.app["engine"].media.icon_cache.get(request.match_info["key"])
    if not hit:
        raise web.HTTPNotFound()
    return web.Response(body=hit[0], content_type="image/png", headers={"Cache-Control": "max-age=3600"})


async def pick_app(request):
    """Opens macOS's own file picker on the Mac running the daemon; answers with the chosen app's name (or nothing if cancelled)."""
    p = await asyncio.create_subprocess_exec("osascript", "-e", 'POSIX path of (choose file of type {"com.apple.application-bundle"} with prompt "Choose an app" default location (path to applications folder))',
                                             stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, _ = await asyncio.wait_for(p.communicate(), 300)
    except asyncio.TimeoutError:
        p.kill()
        return web.json_response({"name": ""})
    path = out.decode().strip().rstrip("/")
    name = path.rsplit("/", 1)[-1]
    return web.json_response({"name": name[:-4] if name.endswith(".app") else name} if path else {"name": ""})


async def app_exists(request):
    return web.json_response({"found": apps.exists(request.query.get("name", ""))})


async def media_art(request):
    hit = request.app["engine"].media.art_cache.get(request.match_info["key"])
    if not hit:
        raise web.HTTPNotFound()
    return web.Response(body=hit[0], content_type="image/jpeg", headers={"Cache-Control": "max-age=3600"})


REDIRECT = f"http://127.0.0.1:{PORT}/spotify/callback"
PAGE = ("<!doctype html><meta charset=utf-8><title>Spotify</title><body style='font:16px system-ui;background:#111;color:#eee;"
        "display:grid;place-items:center;height:100vh;margin:0'><div style='text-align:center;max-width:380px'><h2>{h}</h2><p style='color:#aaa'>{p}</p></div>")


async def spotify_login(request):
    try:
        raise web.HTTPFound(request.app["engine"].media.spotify.login_url(REDIRECT))
    except ValueError as exc:
        return web.Response(text=PAGE.format(h="Almost there", p=str(exc)), content_type="text/html")


async def spotify_callback(request):
    eng: Engine = request.app["engine"]
    q = request.query
    if q.get("error") or not q.get("code"):
        eng.media.spotify.error = q.get("error", "Sign-in was cancelled")
        eng.media._publish(True)
        return web.Response(text=PAGE.format(h="Spotify wasn't connected", p=eng.media.spotify.error), content_type="text/html")
    try:
        await eng.media.spotify.finish_login(q["code"], q.get("state", ""), REDIRECT)
    except Exception as exc:  # noqa: BLE001
        eng.media._publish(True)
        return web.Response(text=PAGE.format(h="Spotify wasn't connected", p=str(exc)), content_type="text/html")
    eng.media._liked_for = ""
    eng.media._publish(True)
    return web.Response(text=PAGE.format(h="Spotify is connected", p="You can close this tab and go back to Push Deck."), content_type="text/html")


async def main():
    eng = Engine()
    app = web.Application()
    app["engine"] = eng
    app.router.add_get("/ws", ws_handler)
    app.router.add_post("/api/ask", ask_hook)
    app.router.add_get("/api/app/{bundle}", app_info)
    app.router.add_get("/api/app-icon/{bundle}", app_icon)
    app.router.add_get("/api/media/art/{key}", media_art)
    app.router.add_get("/api/media/icon/{key}", media_icon)
    app.router.add_get("/api/pick-app", pick_app)
    app.router.add_get("/api/app-exists", app_exists)
    app.router.add_get("/spotify/login", spotify_login)
    app.router.add_get("/spotify/callback", spotify_callback)
    dist = ROOT / "ui" / "dist"
    if dist.exists():
        app.router.add_get("/", lambda r: web.FileResponse(dist / "index.html"))
        app.router.add_static("/", dist)
    async def no_cache(request, response):   # the app's web view must pick up a rebuilt UI at once
        if not request.path.startswith(("/api/", "/ws")):
            response.headers["Cache-Control"] = "no-cache"
    app.on_response_prepare.append(no_cache)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", PORT).start()
    print(f"push daemon on http://127.0.0.1:{PORT}")
    await eng.tick()

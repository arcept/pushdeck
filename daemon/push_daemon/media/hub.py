"""MediaHub: finds what is playing on this Mac (Spotify desktop, YouTube Music and other web players in Chrome, anything else by
its audio), controls it, and feeds the display. Players are probed about once a second; the audio spectrum arrives ~43x/s."""
from __future__ import annotations

import asyncio
import colorsys
import hashlib
import io
import json
import os
import re
import subprocess
import time

import aiohttp
import numpy as np
from PIL import Image

from .. import apps
from . import audio as audiomod
from .spotify import Spotify
from .system import SystemNowPlaying
from .ytm import YouTubeMusic

SEP = chr(31)
WEB_HOSTS = ("music.youtube.com", "www.youtube.com", "open.spotify.com", "soundcloud.com", "music.apple.com", "bandcamp.com",
             "tidal.com", "deezer.com", "listen.tidal.com", "play.qobuz.com")
JS_STATE = ("(function(){var m=navigator.mediaSession,d=m&&m.metadata,vs=[].slice.call(document.querySelectorAll('video,audio')),v=vs.filter(function(x){return !x.paused&&!x.ended})[0]||vs[0],a=d&&d.artwork,bp=document.querySelector('ytmusic-player-bar #progress-bar'),bm=bp?parseFloat(bp.getAttribute('aria-valuemax')):NaN,bn=bp?parseFloat(bp.getAttribute('aria-valuenow')):NaN,bt=bm>0&&bn>=0;"
            "return JSON.stringify({title:d&&d.title||(v&&!v.paused?document.title:''),artist:d&&d.artist||'',album:d&&d.album||'',"
            "art:a&&a.length?a[a.length-1].src:'',state:m&&m.playbackState||'',pos:bt?bn:(v?v.currentTime:0),dur:bt?bm:(v&&isFinite(v.duration)?v.duration:0),"
            "paused:v?v.paused:true,liked:(function(){var b=document.querySelector('ytmusic-like-button-renderer');return b?b.getAttribute('like-status')==='LIKE':null})(),repeatMode:(document.querySelector('ytmusic-player-bar')||{getAttribute:function(){return null}}).getAttribute('repeat-mode')})})()")
YTM_CLICK = {"shuffle": ".shuffle", "repeat": ".repeat", "play": ".play-pause-button", "next": ".next-button", "prev": ".previous-button",
             "like": "ytmusic-like-button-renderer #button-shape-like button, ytmusic-like-button-renderer .like"}
# The player's own colours while a source plays: its volume meter, progress bar, button bars and list highlight use these.
BRANDS = {"spotify": "#1ed760", "ytm": "#ff2e43", "chrome": "#4c8bf5", "com.apple.Music": "#fa2d48", "org.videolan.vlc": "#ff8800"}
LIKED = "spotify:collection:liked"  # our own id for your Liked Songs
KEYS = {"play": 100, "next": 101, "prev": 98}  # F8 / F9 / F7 media keys


from .hub_util import osa  # noqa: E402,F401


def running(name: str) -> bool:
    return subprocess.run(["pgrep", "-x", name], capture_output=True).returncode == 0


def _num(s) -> float:
    try:
        return float(str(s).replace(",", "."))
    except ValueError:
        return 0.0


class MediaHub:
    def __init__(self, get_settings, on_change):
        self.get_settings, self.on_change = get_settings, on_change
        self._playing_prev: set = set()
        self.icon_cache: dict[str, tuple[bytes, Image.Image]] = {}  # app icon key -> (png, 64px image)
        self.spotify = Spotify()
        self.system = SystemNowPlaying()
        self.ytm = YouTubeMusic(self._chrome_tabs)
        self.audio = audiomod.AudioTap()
        self.track: dict = {}                # what is playing (or was last): source, title, artist, album, art, duration, position, playing, ...
        self.player = ""                     # "spotify" | "chrome" | ""
        self.chrome = {"state": "unknown", "message": ""}  # unknown | ok | needs_js | off
        self.art_cache: dict[str, tuple[bytes, Image.Image, str]] = {}  # key -> (jpeg, 160px image, tint)
        self.queue: list = []
        self.last_seen = 0.0                 # when a track was last playing
        self._sig = ""
        self._pos_at = 0.0
        self._liked_for, self._liked_at = "", 0.0
        self._http: aiohttp.ClientSession | None = None
        self._task = None
        self.want_viz_until = 0.0
        self._bad_tabs: dict[str, float] = {}
        self._t0 = time.time()

    # ---------- settings ----------
    def cfg(self) -> dict:
        return self.get_settings().get("media") or {}

    # ---------- lifecycle ----------
    def start(self):
        self._task = asyncio.ensure_future(self._poll())

    def need_audio(self):
        """The display shows a visualizer: make sure audio capture is running (it stops again a while after the visualizer goes)."""
        self.want_viz_until = time.time() + 30
        if self.cfg().get("audio", True) and self.audio.status in ("off", "error") and self.audio.status != "starting":
            if self.audio.status == "off" or time.time() - self.audio.last_frame > 20:
                self.audio.start()

    async def sound_test(self):
        """The setup's Check button: start listening, play a short chime, and report whether the chime came through."""
        a = self.audio
        if a.check == "listening":
            return
        a.check, a.loudest = "listening", 0.0
        self.need_audio()
        self._publish(force=True)
        for _ in range(24):  # give the helper up to 6 s to start (the first time, macOS may ask). It sends nothing while the Mac is silent
            if a.status in ("ok", "unavailable", "error"):
                break
            await asyncio.sleep(0.25)
        for _ in range(3):
            p = await asyncio.create_subprocess_exec("afplay", "/System/Library/Sounds/Glass.aiff")
            await p.wait()
            if a.loudest > 2e-3:
                break
        await asyncio.sleep(0.4)
        a.check = "heard" if a.loudest > 2e-3 else "silent"
        self._publish(force=True)

    # ---------- reading ----------
    def position(self) -> float:
        t = self.track
        if not t:
            return 0.0
        p = t.get("position", 0.0) + ((time.time() - self._pos_at) if t.get("playing") else 0.0)
        return min(p, t.get("duration") or p)

    def viz(self):
        """(bars, wave, real) for the renderer: real audio when it is flowing, otherwise a soft synthetic animation."""
        if self.audio.live and self.cfg().get("audio", True) and (self.track.get("playing") or self.audio.level > 2e-4):
            return self.audio.bars, self.audio.wave, True
        b, w = self.audio.synthetic(time.time() - self._t0, bool(self.track.get("playing")))
        return b, w, False

    def playing(self) -> bool:
        if self.track.get("playing"):
            return True
        return False

    def active(self) -> bool:
        """Something is, or just was, playing."""
        return bool(self.track.get("title")) and (self.playing() or time.time() - self.last_seen < 8)

    def snapshot(self) -> dict:
        t = self.track
        return {"player": self.player, "track": {k: t.get(k) for k in ("source", "title", "artist", "album", "art", "duration", "playing", "shuffle",
                                                                      "repeat", "liked", "caps", "icon", "brand", "service")} if t else None,
                "position": round(self.position(), 1), "tint": t.get("tint") if t else None, "tint2": self.partner(t["tint"]) if t and t.get("tint") else None,
                "spotify": self.spotify.status(), "chrome": self.chrome,
                "audio": {"status": self.audio.status, "message": self.audio.message, "live": self.audio.live, "check": self.audio.check},
                "queue": self.queue}

    def _publish(self, force=False):
        s = self.snapshot()
        s["position"] = int(s["position"] // 5)  # position alone doesn't count as a change
        sig = json.dumps(s, sort_keys=True)
        if force or sig != self._sig:
            self._sig = sig
            self.on_change()

    # ---------- polling ----------
    async def _poll(self):
        while True:
            try:
                found = await self._probe()
                await self._apply(found)
                if self.audio.status != "off" and time.time() > self.want_viz_until:
                    self.audio.stop()
                self._publish()
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(1.0 if self.want_viz_until > time.time() else 2.5)

    async def _probe(self) -> list[dict]:
        out = []
        if self.cfg().get("spotify_desktop", True) and running("Spotify"):
            s = await self._spotify_desktop()
            if s:
                out.append(s)
        if self.cfg().get("chrome", True) and running("Google Chrome"):
            out += await self._chrome()
        else:
            self.chrome = {"state": "off", "message": ""}
        sysd = await self.system.info() if self.cfg().get("system", True) else None
        if sysd and not any(o["title"] == sysd["title"] for o in out):  # anything else macOS has: a video tab, Music, VLC...
            art = sysd.pop("art")
            out.append({"source": "system", "web": "", "app": sysd.get("app", ""), "shuffle": None, "repeat": None, "caps": ["play", "next", "prev"], "art": "", "_art_bytes": art, **sysd})
        return out

    async def _spotify_desktop(self):
        try:
            r = await osa('tell application "Spotify"\nif player state is stopped then return "stopped"\nset t to current track\n'
                          'return (player state as text) & (ASCII character 31) & (name of t) & (ASCII character 31) & (artist of t) & '
                          '(ASCII character 31) & (album of t) & (ASCII character 31) & (duration of t) & (ASCII character 31) & '
                          '(player position) & (ASCII character 31) & (artwork url of t) & (ASCII character 31) & (shuffling as text) & '
                          '(ASCII character 31) & (repeating as text) & (ASCII character 31) & (spotify url of t)\nend tell')
        except Exception:  # noqa: BLE001
            return None
        f = r.split(SEP)
        if len(f) < 10:
            return None
        caps = ["play", "next", "prev", "shuffle", "repeat", "seek"] + (["like"] if self.spotify.connected else [])
        return {"source": "spotify", "playing": f[0] == "playing", "title": f[1], "artist": f[2], "album": f[3],
                "duration": _num(f[4]) / 1000, "position": _num(f[5]), "art": f[6], "shuffle": f[7] == "true", "repeat": f[8] == "true",
                "uri": f[9], "caps": caps}

    async def _chrome_tabs(self):
        """[(window, tab, url, title)] of tabs that look like players. Listing is instant: no JavaScript runs here."""
        hosts = " or ".join(f'u contains "{h}"' for h in WEB_HOSTS)
        script = ('tell application "Google Chrome"\nset out to ""\nrepeat with wi from 1 to count of windows\nrepeat with ti from 1 to count of tabs of window wi\n'
                  'set u to URL of tab ti of window wi\n'
                  f'if {hosts} then set out to out & wi & (ASCII character 31) & ti & (ASCII character 31) & u & (ASCII character 31) & (title of tab ti of window wi) & linefeed\n'
                  'end repeat\nend repeat\nreturn out\nend tell')
        rows = []
        for line in (await osa(script, 5.0)).splitlines():
            f = line.split(SEP)
            if len(f) == 4:
                rows.append((int(f[0]), int(f[1]), f[2], f[3]))
        # a YouTube video page is only a player if it is a watch page; music.youtube.com first
        rows = [r for r in rows if "youtube.com" not in r[2] or "music.youtube.com" in r[2] or "/watch" in r[2]]
        rows.sort(key=lambda r: "music.youtube.com" not in r[2])
        return rows

    async def _chrome_tab_state(self, wi, ti, url, title):
        js = JS_STATE.replace("\\", "\\\\").replace('"', '\\"')
        try:  # a frozen background tab never answers: give each tab one second
            r = await osa(f'tell application "Google Chrome"\nwith timeout of 1 second\nreturn execute tab {ti} of window {wi} javascript "{js}"\nend timeout\nend tell', 3.0)
            return "ok", json.loads(r)
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            return ("needs_js" if ("JavaScript" in msg and "Apple Events" in msg) else "fail"), None

    async def _chrome(self) -> list[dict]:
        try:
            rows = await self._chrome_tabs()
        except Exception as exc:  # noqa: BLE001
            self.chrome = {"state": "unknown", "message": (str(exc) or "Chrome didn't answer")[:120]}
            return []
        now = time.time()
        rows = [r for r in rows if self._bad_tabs.get(r[2], 0) < now][:5]
        results = await asyncio.gather(*[self._chrome_tab_state(*r) for r in rows])
        found, needs_js = [], False
        for (wi, ti, url, title), (st, d) in zip(rows, results):
            if st == "needs_js":
                needs_js = True
            if st == "fail":
                self._bad_tabs[url] = now + 60  # a frozen tab: leave it alone for a minute
            if st == "ok" and d and d.get("title"):
                playing = d.get("state") == "playing" or (d.get("state") in ("", "none") and not d.get("paused", True))
                found.append({"source": "chrome", "web": url, "playing": playing, "title": d["title"], "artist": d.get("artist", ""),
                              "album": d.get("album", ""), "duration": float(d.get("dur") or 0), "position": float(d.get("pos") or 0),
                              "art": d.get("art", ""), "shuffle": None, "repeat": (d.get("repeatMode") not in (None, "NONE")) if "music.youtube.com" in url else None,
                              "repeat_mode": d.get("repeatMode") or "", "liked": d.get("liked"),
                              "caps": ["play", "next", "prev", "seek"] + (["like", "shuffle", "repeat"] if "music.youtube.com" in url else [])})
            elif st in ("needs_js", "fail"):
                t = re.sub(r"^\(\d+\)\s*", "", re.sub(r"\s*[-–]\s*YouTube( Music)?$", "", title)).strip()
                if t and t not in ("YouTube Music", "YouTube", "Spotify", "Spotify – Web Player") and st == "needs_js":
                    found.append({"source": "chrome", "web": url, "playing": False, "title": t, "artist": "", "album": "", "duration": 0,
                                  "position": 0, "art": "", "shuffle": None, "repeat": None, "caps": ["play", "next", "prev"], "titles_only": True})
        self.chrome = {"state": "needs_js" if needs_js else "ok", "message": ""}
        return found

    async def _apply(self, found: list[dict]):
        audible = self.audio.live and self.audio.level > 2e-4
        # Tab-title-only players can't say whether they play: if sound is coming out and nothing else claims it, it is them.
        if audible and not any(f["playing"] for f in found):
            for f in found:
                if f.get("titles_only"):
                    f["playing"] = True
                    break
        # Stay on the player you are on until another one starts playing: a paused Spotify is not replaced by a paused YouTube Music tab.
        ids = {f["source"] + f.get("web", "") for f in found if f["playing"]}
        for f in found:
            f["_new"] = f["playing"] and (f["source"] + f.get("web", "")) not in self._playing_prev
        self._playing_prev = ids
        found.sort(key=lambda f: (not f["playing"], not f["_new"], f["source"] != self.player, "music.youtube.com" not in f.get("web", ""), f["source"] == "system"))
        pick = found[0] if found else None
        if not pick:
            if self.track and time.time() - self.last_seen > 8:
                self.track["playing"] = False
            if self.track and self.track.get("playing") and not found:
                self.track["playing"] = False
            return
        old = self.track
        self.player = pick["source"]
        pick["icon"] = self._icon(pick)
        pick["service"] = self._brand_of(pick)   # "spotify" | "ytm" | "chrome" | an app id
        pick["brand"] = BRANDS.get(pick["service"], "")
        art_url, art_bytes = pick.pop("art", ""), pick.pop("_art_bytes", None)
        pick["art"] = await self._art(art_url, art_bytes) if (art_url or art_bytes) else ""
        pick["tint"] = self.art_cache[pick["art"]][2] if pick["art"] in self.art_cache else (old.get("tint") if old.get("title") == pick["title"] else None)
        pick["liked"] = pick["liked"] if pick.get("liked") is not None else (old.get("liked") if old.get("title") == pick["title"] else None)
        now, raw = time.time(), pick["position"]
        if old.get("title") == pick["title"] and old.get("source") == pick["source"]:
            if pick["playing"] and old.get("_raw_pos") is not None and pick["duration"]:
                dt = now - old["_raw_t"]
                # A player that says "playing" but whose position stands still (a finished track, a stalled stream) is paused.
                stalls = old.get("_stalls", 0) + 1 if dt > 0.8 and raw - old["_raw_pos"] < 0.25 * dt else 0
                pick["_stalls"] = stalls
                if stalls >= 2:
                    pick["playing"] = False
            if pick["playing"] and abs(raw - self.position()) < 1.5:
                pick["position"] = self.position()  # keep our smooth clock; probes jitter by a second and made the time flicker
        pick["_raw_pos"], pick["_raw_t"] = raw, now
        self.track = pick
        self._pos_at = now
        if pick["playing"]:
            self.last_seen = time.time()
        if pick["source"] == "spotify" and self.spotify.connected and pick.get("uri") and (self._liked_for != pick["uri"] or now - self._liked_at > 30):
            self._liked_for, self._liked_at = pick["uri"], now
            asyncio.ensure_future(self._load_liked(pick["uri"]))

    async def _load_liked(self, uri):
        liked = await self.spotify.is_liked(uri)
        if liked is not None and self.track.get("uri") == uri:
            self.track["liked"] = liked
            self._publish(True)
        self.queue = await self.spotify.queue(8)

    # ---------- artwork ----------
    async def _art(self, url: str, data: bytes | None = None) -> str:
        key = hashlib.sha1(data if data else url.encode()).hexdigest()[:12]
        if key in self.art_cache:
            return key
        try:
            if data is None:
                self._http = self._http or aiohttp.ClientSession()
                async with self._http.get(url, timeout=aiohttp.ClientTimeout(total=6)) as r:
                    data = await r.read()
            im = Image.open(io.BytesIO(data)).convert("RGB")
            w, h = im.size
            s = min(w, h)
            im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((160, 160), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=85)
            self.art_cache[key] = (buf.getvalue(), im, self._tint(im))
            if len(self.art_cache) > 12:
                self.art_cache.pop(next(iter(self.art_cache)))
            return key
        except Exception:  # noqa: BLE001
            return ""

    @staticmethod
    def _brand_of(t: dict) -> str:
        src, web = t.get("source"), t.get("web", "")
        if src == "spotify" or t.get("app") == "com.spotify.client":
            return "spotify"
        if src == "chrome" and "music.youtube.com" in web:
            return "ytm"
        if src == "chrome" or t.get("app") == "com.google.Chrome":
            return "chrome"
        return t.get("app", "")

    def _icon(self, t: dict) -> str:
        """Key of the small icon of the app this track plays in: Spotify, the YouTube Music app, Chrome, or whatever macOS says (VLC, Music...)."""
        src, web, bundle, path = t.get("source"), t.get("web", ""), "", ""
        if src == "spotify":
            bundle = "com.spotify.client"
        elif src == "chrome":
            yt = os.path.expanduser("~/Applications/Chrome Apps.localized/YouTube Music.app")
            if "music.youtube.com" in web and os.path.isdir(yt):
                path = yt
            else:
                bundle = "com.google.Chrome"
        else:
            bundle = t.get("app", "")
        key = path or bundle
        if not key:
            return ""
        h = hashlib.sha1(key.encode()).hexdigest()[:10]
        if h not in self.icon_cache:
            png = apps.icon_png(bundle, path)
            if not png:
                return ""
            self.icon_cache[h] = (png, Image.open(io.BytesIO(png)).convert("RGBA"))
        return h

    @staticmethod
    def _tint(im: Image.Image) -> str:
        """The artwork's dominant colour, pushed to a bright, highly saturated version of itself so it reads on pure black."""
        a = np.asarray(im.resize((32, 32)), dtype=np.float32) / 255
        mx, mn = a.max(2), a.min(2)
        sat = (mx - mn) / np.maximum(mx, 1e-3)
        w = (sat ** 2) * mx + 1e-4
        c = (a * w[..., None]).sum((0, 1)) / w.sum()
        h, s, v = colorsys.rgb_to_hsv(*[float(x) for x in c])
        return "#%02x%02x%02x" % tuple(int(x * 255) for x in colorsys.hsv_to_rgb(h, max(0.8, s), 1.0))

    @staticmethod
    def partner(tint: str) -> str:
        """A second colour a little way round the colour wheel, for gradients."""
        r, g, b = (int(tint[i:i + 2], 16) / 255 for i in (1, 3, 5))
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        return "#%02x%02x%02x" % tuple(int(x * 255) for x in colorsys.hsv_to_rgb((h + 0.11) % 1, min(1.0, s), 1.0))

    # ---------- control ----------
    def browse_src(self) -> str:
        """Which service Browse would list for the current song: 'spotify' (needs the Spotify connection), 'ytm' (the YouTube Music page), or ''."""
        t = self.track or {}
        if t.get("service") == "ytm":
            return "ytm"
        return "spotify" if t.get("source") == "spotify" and self.spotify.connected else ""

    async def browse_items(self, tab: str, src: str = ""):
        """-> (items, note): the queue or playlists for the list screen."""
        src = src or self.browse_src()
        favs = list(self.cfg().get("favorites") or [])
        if src == "ytm":
            if tab == "queue":
                return await self.ytm.queue()
            pl, note = await self.ytm.playlists()
            if tab == "favorites":
                by = {r["uri"]: r for r in pl}
                return [by[u] for u in favs if u in by], "No favorites yet: press Favorite on a playlist"
            return pl, note
        if not self.spotify.connected:
            return [], "Connect Spotify to browse"
        if tab == "queue":
            q = await self.spotify.queue(100)  # Spotify's queue endpoint itself hands back at most 20 entries
            self.queue = q[:8]
            return [{"text": x["title"], "sub": x["artist"], "uri": x["uri"]} for x in q], "Nothing queued"
        pl = await self.spotify.playlists()
        me = await self.spotify.user_id()
        # "mine" = made or shared with you (Spotify lets this app open those); "public" = everyone else's that you follow;
        # "favorites" = the ones you starred, either kind, in the order you starred them
        rows = [{"text": p["name"], "sub": f'{p["tracks"]} songs', "uri": p["uri"], "can_open": p.get("owner") == me or bool(p.get("collab"))} for p in pl]
        if tab in ("mine", "favorites"):   # Liked Songs is not a playlist to Spotify's API, so it is added by hand, first
            st, d = await self.spotify.request("GET", "/me/tracks", {"limit": 1})
            if st == 200 and d:
                rows.insert(0, {"text": "Liked Songs", "sub": f'{d.get("total", 0)} songs', "uri": LIKED, "can_open": True})
        if tab == "favorites":
            by = {r["uri"]: r for r in rows}
            return [by[u] for u in favs if u in by], "No favorites yet: press Favorite on a playlist"
        return [r for r in rows if r["can_open"] == (tab == "mine")], "No playlists here"

    async def playlist_items(self, uri: str):
        """-> (songs, note) inside one playlist. Spotify only lets this app read playlists you made or share."""
        if uri.startswith("ytm:"):
            return await self.ytm.songs(uri)
        liked = uri == LIKED
        pid = uri.rsplit(":", 1)[-1]
        out, offset = [], 0
        while offset < (1000 if liked else 500):   # every page of 50, up to 500 songs (1000 for Liked Songs)
            if liked:
                st, d = await self.spotify.request("GET", "/me/tracks", {"limit": 50, "offset": offset})
            else:
                st, d = await self.spotify.request("GET", f"/playlists/{pid}/items", {"limit": 50, "offset": offset,
                                                                                       "fields": "next,items(item(name,uri,artists(name)),track(name,uri,artists(name)))"})
            if st == 403:
                return [], "Spotify only lets this app open playlists you made"
            if st != 200 or not d:
                if out:
                    break
                return [], "Couldn't load this playlist"
            for x in d.get("items", []):
                t = x.get("item") or x.get("track")
                if t and t.get("uri"):
                    out.append({"text": t["name"], "sub": ", ".join(a["name"] for a in t.get("artists", [])), "uri": t["uri"]})
            offset += 50
            if not d.get("next"):
                break
        return out, "This playlist is empty"

    async def queue_add(self, uri: str) -> str:
        """Adds a song to the END of Spotify's queue (the Web API has no 'play next'). -> message for the display."""
        st, _ = await self.spotify.request("POST", "/me/player/queue", {"uri": uri})
        if st in (200, 204):
            return "Added to queue"
        return self.spotify.error or "Couldn't add to the queue (is Spotify playing?)"

    async def browse_pick(self, tab: str, item: dict, idx: int, ctx: str = "") -> str:
        """Start what was chosen: a playlist, a song inside a playlist, or a queue entry. '' when it failed."""
        if item["uri"].startswith("ytm:"):
            return "ok" if await self.ytm.play(tab, item, ctx) else ""
        try:
            me = await self.spotify.user_id() if LIKED in (ctx, item["uri"]) else ""
            if ctx:
                ctx = f"spotify:user:{me}:collection" if ctx == LIKED else ctx
                await osa(f'tell application "Spotify" to play track "{item["uri"]}" in context "{ctx}"')
            elif tab in ("mine", "public", "favorites"):
                uri = f"spotify:user:{me}:collection" if item["uri"] == LIKED else item["uri"]
                await osa(f'tell application "Spotify" to play track "{uri}"')
            else:
                await osa('tell application "Spotify"\nrepeat ' + str(idx + 1) + ' times\nnext track\ndelay 0.15\nend repeat\nend tell')
            return "ok"
        except Exception:  # noqa: BLE001
            return ""

    async def command(self, op: str, arg=None) -> str:
        """-> a short message for the display, '' for none."""
        t, src = self.track, self.track.get("source")
        caps = t.get("caps", []) if t else []
        if op in ("like", "shuffle", "repeat", "seek") and op not in caps:
            return {"like": "Connect Spotify to save tracks", "seek": "Can't seek this player"}.get(op, "Not available here")
        try:
            if op == "play":
                if not t:
                    await self._key("play")
                elif src == "spotify":
                    await osa('tell application "Spotify" to playpause')
                elif src == "chrome":
                    await self._chrome_do("play")
                else:
                    await self.system.send("play") or await self._key("play")
                t["playing"] = not t.get("playing") if t else False
                self._pos_at = time.time()
            elif op in ("next", "prev"):
                if src == "spotify":
                    await osa(f'tell application "Spotify" to {"next" if op == "next" else "previous"} track')
                elif src == "chrome":
                    await self._chrome_do(op)
                else:
                    await self.system.send(op) or await self._key(op)
            elif op in ("shuffle", "repeat") and src == "chrome":   # YouTube Music: Shuffle reshuffles the queue (it has no on/off state), Repeat cycles off > all > one
                await self._chrome_do(op)
                if op == "shuffle":
                    return "Queue shuffled"
                nxt = {"NONE": "ALL", "ALL": "ONE", "ONE": "NONE"}.get(t.get("repeat_mode") or "NONE", "ALL")
                t["repeat_mode"], t["repeat"] = nxt, nxt != "NONE"
                return {"NONE": "Repeat off", "ALL": "Repeat all", "ONE": "Repeat one"}[nxt]
            elif op == "shuffle" and src == "spotify":
                await osa('tell application "Spotify" to set shuffling to not shuffling')
                t["shuffle"] = not t.get("shuffle")
                return "Shuffle " + ("on" if t["shuffle"] else "off")
            elif op == "repeat" and src == "spotify":
                await osa('tell application "Spotify" to set repeating to not repeating')
                t["repeat"] = not t.get("repeat")
                return "Repeat " + ("on" if t["repeat"] else "off")
            elif op == "like":
                if src == "spotify":
                    new = not bool(t.get("liked"))
                    if await self.spotify.set_liked(t["uri"], new):
                        t["liked"] = new
                        return "Saved to Liked Songs" if new else "Removed from Liked Songs"
                    return "Couldn't save: " + (self.spotify.error or "Spotify said no")
                await self._chrome_do("like")
                t["liked"] = not bool(t.get("liked"))
                return "Liked" if t["liked"] else "Removed like"
            elif op == "seek" and arg is not None and t.get("duration"):
                sec = max(0.0, min(1.0, float(arg))) * t["duration"]
                sec = min(sec, max(0.0, t["duration"] - 2.0))   # never to the very end: that would skip to the next song
                if src == "spotify":
                    await osa(f'tell application "Spotify" to set player position to {sec:.1f}')
                else:
                    await self._chrome_do("seek", sec)
                t["position"], self._pos_at = sec, time.time()
        except Exception as exc:  # noqa: BLE001
            return f"Media: {exc}"[:60]
        self._publish(True)
        return ""

    async def _key(self, which):
        await osa(f'tell application "System Events" to key code {KEYS[which]}')

    async def _chrome_do(self, what, arg=None):
        web = self.track.get("web", "music.youtube.com")
        if what == "seek":
            # YouTube Music's media element runs one timeline across consecutive songs (its currentTime and duration include the
            # previous song). The player bar has this song's own position, so find the offset from it and seek in the element's terms.
            js = (f"var vs=document.querySelectorAll('video,audio'),v=null;for(var i=0;i<vs.length;i++){{if(vs[i].duration>0&&(!v||!vs[i].paused))v=vs[i]}}"
                  f"var pb=document.querySelector('ytmusic-player-bar #progress-bar'),n=pb?parseFloat(pb.getAttribute('aria-valuenow')):NaN;"
                  f"if(v)v.currentTime=(isFinite(n)?Math.max(0,v.currentTime-n):0)+{arg:.1f}")
        elif what == "play" and "music.youtube.com" not in web:
            js = "var v=document.querySelector('video,audio');if(v){v.paused?v.play():v.pause()}"
        elif "music.youtube.com" in web and what in YTM_CLICK:
            js = f"var b=document.querySelector(\"{YTM_CLICK[what]}\");if(b)b.click()"
        else:
            return await self._key(what)
        js = js.replace("\\", "\\\\").replace('"', '\\"')
        await osa(f'tell application "Google Chrome"\nrepeat with w in windows\nrepeat with t in tabs of w\nif URL of t is "{web}" then '
                  f'try\nwith timeout of 2 seconds\nexecute t javascript "{js}"\nend timeout\nend try\nend repeat\nend repeat\nend tell')

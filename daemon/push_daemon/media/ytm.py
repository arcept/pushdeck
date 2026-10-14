"""Browse YouTube Music (queue, playlists, songs in a playlist) and start things in it, from the YouTube Music page itself.

There is no official YouTube Music API. What is official (YouTube Data API v3) only knows ordinary YouTube playlists, needs you to register
your own Google Cloud app, and cannot see the YouTube Music queue. So this runs small scripts inside your own already signed-in YouTube
Music tab (the same way hub.py already reads the title): the queue comes from the page, playlists from the page's own backend calls
(its normal session, nothing copied or stored), and "play" uses the page's own navigation. Nothing leaves the Mac except those normal
requests to YouTube. It can break when YouTube changes the page; every call fails soft ("Couldn't load")."""
from __future__ import annotations

import asyncio
import json
import time

from .hub_util import osa

# The page's own client key and version are read from its config (ytcfg) when a call runs, so no key is stored in this repo.
CLIENT_VERSION = "1.20261006.10.00"

QUEUE_JS = ("(function(){var it=[].slice.call(document.querySelectorAll('ytmusic-player-queue-item')),"
            "s=it.findIndex(function(e){return e.hasAttribute('selected')}),o=[];"
            "for(var i=s+1;i<it.length&&o.length<300;i++){var e=it[i];if(e.closest('#counterpart-renderer'))continue;o.push({qi:i,t:((e.querySelector('.song-title')||{}).textContent||'').trim(),"
            "a:((e.querySelector('.byline')||{}).textContent||'').trim()})}return JSON.stringify(o)})()")

# Starts a browse call with the page's own session; the answer is left in window.__push[token] for a later read.
API_JS = """(function(token,browseId,mode){
  window.__push=window.__push||{};window.__push[token]=null;
  var cfg=window.ytcfg&&window.ytcfg.get?window.ytcfg:null,key=cfg&&cfg.get('INNERTUBE_API_KEY'),ver=(cfg&&cfg.get('INNERTUBE_CLIENT_VERSION'))||'__VER__';
  if(!key){window.__push[token]={err:'no page config'};return 'no key'}
  var sap=(document.cookie.match(/(?:^|; )SAPISID=([^;]+)/)||[])[1],origin='https://music.youtube.com',ts=Math.floor(Date.now()/1000);
  function sha1(s){return crypto.subtle.digest('SHA-1',new TextEncoder().encode(s)).then(function(b){return Array.prototype.map.call(new Uint8Array(b),function(x){return('0'+x.toString(16)).slice(-2)}).join('')})}
  function txt(r){return r&&r.runs?r.runs.map(function(q){return q.text}).join(''):''}
  sha1(ts+' '+sap+' '+origin).then(function(h){
    return fetch('/youtubei/v1/browse?key='+encodeURIComponent(key)+'&prettyPrint=false',{method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','Authorization':'SAPISIDHASH '+ts+'_'+h,'X-Goog-AuthUser':'0','X-Origin':origin},
      body:JSON.stringify({context:{client:{clientName:'WEB_REMIX',clientVersion:ver,hl:'en'}},browseId:browseId})});
  }).then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})}).then(function(x){
    var res=[],seen={};
    (function walk(o){if(!o||typeof o!=='object')return;
      var r=o.musicTwoRowItemRenderer;
      if(mode==='playlists'&&r){var id=r.navigationEndpoint&&r.navigationEndpoint.browseEndpoint&&r.navigationEndpoint.browseEndpoint.browseId;
        if(id&&/^VL/.test(id)&&!seen[id]){seen[id]=1;res.push({id:id.slice(2),t:txt(r.title),a:txt(r.subtitle)})}}
      var m=o.musicResponsiveListItemRenderer;
      if(mode==='songs'&&m){var vid=(m.playlistItemData||{}).videoId;
        if(!vid){try{vid=m.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint.videoId}catch(e){}}
        var c=m.flexColumns||[];
        function col(i){try{return txt(c[i].musicResponsiveListItemFlexColumnRenderer.text)}catch(e){return''}}
        if(vid&&!seen[vid+res.length]){seen[vid+res.length]=1;res.push({id:vid,t:col(0),a:col(1)})}}
      for(var k in o)walk(o[k])})(x.j);
    window.__push[token]={s:x.s,items:res.slice(0,500)};
  }).catch(function(e){window.__push[token]={err:String(e)}});
  return 'started';
})""".replace("__VER__", CLIENT_VERSION)


def _wrap(js: str) -> str:
    return js.replace("\\", "\\\\").replace('"', '\\"')


class YouTubeMusic:
    def __init__(self, tabs):
        self._tabs = tabs                      # async () -> [(window, tab, url, title)] of Chrome tabs that look like players
        self._cache: dict = {}                 # key -> (time, items)

    async def _tab(self):
        for wi, ti, url, _ in await self._tabs():
            if "music.youtube.com" in url:
                return wi, ti
        return None

    async def _run(self, js: str, timeout=4.0) -> str:
        tab = await self._tab()
        if not tab:
            raise RuntimeError("no YouTube Music tab")
        wi, ti = tab
        return await osa(f'tell application "Google Chrome"\nwith timeout of 3 seconds\nreturn execute tab {ti} of window {wi} javascript "{_wrap(js)}"\nend timeout\nend tell', timeout)

    async def queue(self):
        """-> (items, note): what plays after the current song. item: {text, sub, uri, qi}."""
        try:
            rows = json.loads(await self._run(QUEUE_JS))
        except Exception:  # noqa: BLE001
            return [], "Open YouTube Music in Chrome to see its queue"
        return [{"text": r["t"], "sub": r["a"], "uri": f"ytm:queue:{r['qi']}", "qi": r["qi"]} for r in rows], "Nothing queued"

    async def _api(self, browse_id: str, mode: str):
        token = f"t{int(time.time() * 1000)}"
        await self._run(f"{API_JS}('{token}','{browse_id}','{mode}')")
        for _ in range(14):
            await asyncio.sleep(0.4)
            r = json.loads(await self._run(f"JSON.stringify((window.__push||{{}})['{token}']||null)") or "null")
            if r:
                if r.get("err") or r.get("s") != 200:
                    raise RuntimeError(r.get("err") or f"status {r.get('s')}")
                return r["items"]
        raise RuntimeError("timeout")

    async def playlists(self):
        """-> (items, note): every playlist in your library (Liked Music first). Cached for a minute."""
        hit = self._cache.get("playlists")
        if hit and time.time() - hit[0] < 60:
            return hit[1], "No playlists found"
        try:
            rows = await self._api("FEmusic_liked_playlists", "playlists")
        except Exception:  # noqa: BLE001
            return [], "Couldn't load YouTube Music playlists (is it open and signed in?)"
        items = [{"text": r["t"], "sub": r["a"].split(" • ")[-1] if " • " in r["a"] else r["a"], "uri": "ytm:playlist:" + r["id"], "can_open": True} for r in rows]
        self._cache["playlists"] = (time.time(), items)
        return items, "No playlists found"

    async def songs(self, uri: str):
        """-> (items, note): the songs of one playlist."""
        pid = uri.rsplit(":", 1)[-1]
        try:
            rows = await self._api("VL" + pid, "songs")
        except Exception:  # noqa: BLE001
            return [], "Couldn't load this playlist"
        return [{"text": r["t"], "sub": r["a"], "uri": f"ytm:song:{r['id']}"} for r in rows if r["t"]], "This playlist is empty"

    async def play(self, tab: str, item: dict, ctx: str = "") -> bool:
        """Start a queue entry, a playlist, or a song inside a playlist."""
        try:
            if tab == "queue":
                js = (f"(function(){{var it=document.querySelectorAll('ytmusic-player-queue-item')[{int(item['qi'])}];"
                      "var b=it&&it.querySelector('ytmusic-play-button-renderer');if(b){b.click();return 'ok'}return 'no'})()")
            else:
                if ctx:   # a song inside a playlist
                    ep = "{watchEndpoint:{videoId:'%s',playlistId:'%s'}}" % (item["uri"].rsplit(":", 1)[-1], ctx.rsplit(":", 1)[-1])
                else:
                    ep = "{watchPlaylistEndpoint:{playlistId:'%s'}}" % item["uri"].rsplit(":", 1)[-1]
                js = ("(function(){var a=document.querySelector('ytmusic-app');if(!a)return 'no';"
                      f"a.dispatchEvent(new CustomEvent('yt-navigate',{{bubbles:true,composed:true,detail:{{endpoint:{ep}}}}}));return 'ok'}})()")
            return (await self._run(js)).strip() == "ok"
        except Exception:  # noqa: BLE001
            return False

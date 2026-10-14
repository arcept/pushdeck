"""Spotify Web API with the PKCE sign-in flow: the person pastes their own app's Client ID in Settings > Media.
No client secret is needed or stored. Tokens live in private/spotify.json (git-ignored)."""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from urllib.parse import urlencode

import aiohttp

from ..registry import DATA

PRIVATE = DATA / "private"
PATH = PRIVATE / "spotify.json"
SCOPES = ("user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read "
          "user-library-modify playlist-read-private playlist-read-collaborative")
AUTH, TOKEN, API = "https://accounts.spotify.com/authorize", "https://accounts.spotify.com/api/token", "https://api.spotify.com/v1"


class Spotify:
    def __init__(self):
        self.data: dict = {}
        self.pending: dict = {}  # state -> code verifier while the browser sign-in is open
        self.error = ""
        self._http: aiohttp.ClientSession | None = None
        try:
            self.data = json.loads(PATH.read_text())
        except (OSError, ValueError):
            pass

    # ---------- state ----------
    @property
    def client_id(self) -> str:
        return self.data.get("client_id", "")

    @property
    def connected(self) -> bool:
        return bool(self.data.get("refresh_token"))

    def status(self) -> dict:
        return {"client_id": self.client_id, "connected": self.connected, "user": self.data.get("user", ""), "error": self.error}

    def _save(self):
        PRIVATE.mkdir(parents=True, exist_ok=True)
        PATH.write_text(json.dumps(self.data, indent=2))
        try:
            PATH.chmod(0o600)
        except OSError:
            pass

    def set_client_id(self, cid: str):
        cid = cid.strip()
        if cid != self.client_id:
            self.data = {"client_id": cid}  # a different app: forget the old sign-in
            self._save()
        self.error = ""

    def disconnect(self):
        self.data = {"client_id": self.client_id}
        self._save()
        self.error = ""

    # ---------- sign-in ----------
    def login_url(self, redirect: str) -> str:
        if not self.client_id:
            raise ValueError("Paste your Spotify Client ID first")
        verifier = secrets.token_urlsafe(64)
        state = secrets.token_urlsafe(16)
        self.pending = {state: verifier}
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        return AUTH + "?" + urlencode({"client_id": self.client_id, "response_type": "code", "redirect_uri": redirect, "scope": SCOPES,
                                        "state": state, "code_challenge_method": "S256", "code_challenge": challenge})

    async def _post_token(self, form: dict) -> dict:
        self._http = self._http or aiohttp.ClientSession()
        async with self._http.post(TOKEN, data=form) as r:
            body = await r.json(content_type=None)
            if r.status != 200:
                raise ValueError(body.get("error_description") or body.get("error") or f"HTTP {r.status}")
            return body

    def _take(self, tok: dict):
        self.data["access_token"] = tok["access_token"]
        self.data["expires_at"] = time.time() + tok.get("expires_in", 3600) - 30
        if tok.get("refresh_token"):
            self.data["refresh_token"] = tok["refresh_token"]
        self._save()

    async def finish_login(self, code: str, state: str, redirect: str):
        verifier = self.pending.pop(state, None)
        if not verifier:
            raise ValueError("This sign-in link has expired. Start again from Settings > Media.")
        try:
            self._take(await self._post_token({"grant_type": "authorization_code", "code": code, "redirect_uri": redirect,
                                               "client_id": self.client_id, "code_verifier": verifier}))
            self.error = ""
            _, me = await self.request("GET", "/me")
            self.data["user"] = (me or {}).get("display_name") or (me or {}).get("id") or ""
            self._save()
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc)
            raise

    async def _token(self) -> str | None:
        if not self.connected:
            return None
        if time.time() >= self.data.get("expires_at", 0):
            try:
                self._take(await self._post_token({"grant_type": "refresh_token", "refresh_token": self.data["refresh_token"],
                                                   "client_id": self.client_id}))
            except Exception as exc:  # noqa: BLE001
                self.error = f"Sign-in expired: {exc}"
                self.data.pop("refresh_token", None)
                self._save()
                return None
        return self.data.get("access_token")

    # ---------- calls ----------
    async def request(self, method: str, path: str, params: dict | None = None, body: dict | None = None):
        """-> (http status, json or None). Status 0 = not signed in / network error."""
        tok = await self._token()
        if not tok:
            return 0, None
        self._http = self._http or aiohttp.ClientSession()
        try:
            async with self._http.request(method, API + path, params=params, json=body,
                                          headers={"Authorization": f"Bearer {tok}"}, timeout=aiohttp.ClientTimeout(total=8)) as r:
                data = await r.json(content_type=None) if r.content_length != 0 and r.status != 204 else None
                if r.status == 403 and isinstance(data, dict) and "premium" in json.dumps(data).lower():
                    self.error = "Spotify Premium is needed to control playback from the Push"
                return r.status, data
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc)
            return 0, None

    @staticmethod
    def track_id(uri: str) -> str:
        return uri.rsplit(":", 1)[-1] if uri else ""

    async def is_liked(self, uri: str) -> bool | None:
        # (the old /me/tracks endpoints now answer 403 Forbidden; /me/library takes the full spotify: uri)
        s, d = await self.request("GET", "/me/library/contains", {"uris": uri})
        return bool(d[0]) if s == 200 and d else None

    async def set_liked(self, uri: str, liked: bool) -> bool:
        s, d = await self.request("PUT" if liked else "DELETE", "/me/library", {"uris": uri})
        if s not in (200, 204):
            self.error = f"Spotify answered {s}" + (f": {d['error'].get('message')}" if isinstance(d, dict) and isinstance(d.get("error"), dict) else "")
        return s in (200, 204)

    async def queue(self, limit=10):
        s, d = await self.request("GET", "/me/player/queue")
        if s != 200 or not d:
            return []
        return [{"title": t.get("name", ""), "artist": ", ".join(a["name"] for a in t.get("artists", [])), "uri": t.get("uri", "")}
                for t in d.get("queue", [])[:limit]]

    async def user_id(self) -> str:
        if not getattr(self, "_uid", ""):
            s, d = await self.request("GET", "/me")
            self._uid = (d or {}).get("id", "") if s == 200 else ""
        return self._uid

    async def playlists(self, limit=50):
        """Every playlist in your library, page by page (Spotify gives at most 50 at a time)."""
        out, offset = [], 0
        while offset < 600:
            s, d = await self.request("GET", "/me/playlists", {"limit": limit, "offset": offset})
            if s != 200 or not d:
                break
            items = d.get("items", [])
            out += [{"name": p.get("name", ""), "uri": p.get("uri", ""), "tracks": (p.get("tracks") or p.get("items") or {}).get("total", 0),
                     "owner": (p.get("owner") or {}).get("id", ""), "collab": bool(p.get("collaborative"))} for p in items if p]
            offset += limit
            if not d.get("next") or not items:
                break
        return out

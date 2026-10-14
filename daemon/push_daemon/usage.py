"""Plan usage for the display, read from files the tools write locally. Only the opt-in live Claude read below talks to the network.

claude: live from Claude's usage endpoint when switched on (see below), else ~/.claude/push_usage.json, written by claude_statusline.py when Claude Code runs its status line (terminal CLI).
codex:  the newest ~/.codex/sessions/**/rollout-*.jsonl; Codex records its rate limits in its token_count events.
Each returns {"five_hour": {"used_percentage", "resets_at"}, "seven_day": {...}, "updated_at"} or None when there is nothing yet.
"""
import json
import os
import time
from pathlib import Path

_cache: dict = {}


def _ttl(name, seconds, fn):
    hit = _cache.get(name)
    if hit and time.time() - hit[0] < seconds:
        return hit[1]
    try:
        val = fn()
    except Exception:  # noqa: BLE001
        val = None
    _cache[name] = (time.time(), val)
    return val


# ---- Claude ----
# Live (opt-in, settings["claude_usage_live"]): the same read the Claude desktop app makes for its own usage screen. The desktop app's own login
# is read from its token cache (decrypted with the "Claude Safe Storage" Keychain key; macOS asks once; falls back to the terminal login in the
# "Claude Code-credentials" item) and sent only to api.anthropic.com, about every 90 s. The token is kept in memory only, never written or
# logged, and never refreshed here (the Claude app does that; when it has, the next read picks the new one up).
# Without it, the file written by claude_statusline.py (terminal CLI) is used when it exists.
LIVE = {"claude": False}
_live = {"data": None, "at": 0.0, "busy": False, "status": "", "token": None, "exp": 0.0}
OK_EVERY, RETRY_EVERY = 90, 300


CONTEXT_WINDOW = [1_000_000]   # tokens; set from settings["claude_context_window"] (the window isn't written to any file)


def context():
    """How full the context is in the Claude Code session worked in most recently: {"tokens", "window"} from the last assistant message's
    usage in the newest ~/.claude/projects/*/*.jsonl, or None."""
    def read():
        files = sorted((Path.home() / ".claude" / "projects").glob("*/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:1]
        for f in files:
            for line in reversed(_tail(f, 300_000).splitlines()):
                if '"usage"' not in line or '"type":"assistant"' not in line.replace(" ", ""):
                    continue
                try:
                    use = json.loads(line)["message"]["usage"]
                except (ValueError, KeyError, TypeError):
                    continue
                tokens = (use.get("input_tokens") or 0) + (use.get("cache_creation_input_tokens") or 0) + (use.get("cache_read_input_tokens") or 0)
                if tokens:
                    return {"tokens": tokens, "window": CONTEXT_WINDOW[0]}
        return None
    return _ttl("context", 5, read)


def plan():
    """The plan name (Pro, Max...) when the desktop login told us."""
    return (_live.get("plan") or "").title()


_SAFE = {"key": None}


def _safe_storage_key():
    """The key Electron apps use to encrypt their stored logins (macOS Keychain item "Claude Safe Storage"; macOS asks once). In memory only."""
    import hashlib
    import subprocess
    if _SAFE["key"] is None:
        r = subprocess.run(["security", "find-generic-password", "-s", "Claude Safe Storage", "-w"], capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            raise PermissionError("keychain")
        _SAFE["key"] = hashlib.pbkdf2_hmac("sha1", r.stdout.strip().encode(), b"saltysalt", 1003, 16)
    return _SAFE["key"]


def _aes_cbc_decrypt(key, data):
    """AES-128-CBC with PKCS7 padding and the 16-space IV Chromium uses, through macOS CommonCrypto (no extra packages, no secrets on a command line)."""
    import ctypes
    lib = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
    out = ctypes.create_string_buffer(len(data) + 16)
    n = ctypes.c_size_t(0)
    rc = lib.CCCrypt(1, 0, 1, key, 16, b" " * 16, data, len(data), out, len(out), ctypes.byref(n))
    if rc != 0:
        raise ValueError("decrypt")
    return out.raw[:n.value]


def _desktop_token():
    """The Claude desktop app's own Claude Code login: its encrypted token cache in config.json, decrypted in memory. The app refreshes it."""
    import base64
    cfg = json.loads((Path.home() / "Library" / "Application Support" / "Claude" / "config.json").read_text())
    best = None
    for name in ("oauth:tokenCacheV2", "oauth:tokenCache"):
        blob = cfg.get(name)
        if not blob:
            continue
        raw = base64.b64decode(blob)
        if raw[:3] != b"v10":
            continue
        for k, v in json.loads(_aes_cbc_decrypt(_safe_storage_key(), raw[3:])).items():
            exp = float(v.get("expiresAt") or 0) / 1000.0
            if "user:profile" not in k or not v.get("token") or exp - 60 < time.time():
                continue
            rank = (("claude_code" in k), exp)              # prefer the Claude Code login, then the longest-lived
            if best is None or rank > best[0]:
                best = (rank, v["token"], exp)
                _live["plan"] = v.get("subscriptionType") or _live.get("plan")
    if best is None:
        raise LookupError("desktop login not found or expired")
    return best[1], best[2]


def _cli_token():
    """Fallback: the terminal Claude Code's login (Keychain item "Claude Code-credentials")."""
    import subprocess
    r = subprocess.run(["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"], capture_output=True, text=True, timeout=20)
    if r.returncode != 0:
        raise PermissionError("keychain")
    o = json.loads(r.stdout)["claudeAiOauth"]
    return o["accessToken"], float(o.get("expiresAt") or 0) / 1000.0


def _token():
    if _live["token"] and _live["exp"] - 60 > time.time():
        return _live["token"]
    for fn in (_desktop_token, _cli_token):
        try:
            tok, exp = fn()
        except PermissionError:
            raise
        except Exception:  # noqa: BLE001
            continue
        if exp - 60 > time.time():
            _live.update(token=tok, exp=exp)
            return tok
    raise LookupError("no valid login")


def _epoch(iso):
    from datetime import datetime
    try:
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()) if iso else None
    except ValueError:
        return None


def _refresh_claude():
    import urllib.error
    import urllib.request
    try:
        req = urllib.request.Request("https://api.anthropic.com/api/oauth/usage", headers={
            "Authorization": "Bearer " + _token(), "anthropic-beta": "oauth-2025-04-20", "User-Agent": "pushdeck"})
        with urllib.request.urlopen(req, timeout=10) as r:
            d = json.loads(r.read())
        out = {"updated_at": int(time.time())}
        for key in ("five_hour", "seven_day"):
            w = d.get(key)
            if isinstance(w, dict) and w.get("utilization") is not None:
                out[key] = {"used_percentage": float(w["utilization"]), "resets_at": _epoch(w.get("resets_at"))}
        _live.update(data=out if len(out) > 1 else None, status="" if len(out) > 1 else "no data yet")
        _live["ok"] = len(out) > 1
    except PermissionError:
        _live.update(status="allow Keychain access", ok=False)
    except LookupError:
        _live.update(status="login expired", ok=False, token=None)
    except urllib.error.HTTPError as e:
        _live.update(status="login expired" if e.code in (401, 403) else "usage unavailable", ok=False, token=None)
    except Exception:  # noqa: BLE001
        _live.update(status="usage unavailable", ok=False)
    finally:
        _live["at"] = time.time()
        _live["busy"] = False


def claude():
    """Latest Claude usage (live when switched on, else the status-line file), or None. Never blocks: a refresh runs in a thread."""
    if LIVE["claude"]:
        every = OK_EVERY if _live.get("ok") else RETRY_EVERY
        if not _live["busy"] and time.time() - _live["at"] > every:
            import threading
            _live["busy"] = True
            threading.Thread(target=_refresh_claude, daemon=True).start()
        if _live["data"]:
            return _live["data"]

    def read():
        p = Path.home() / ".claude" / "push_usage.json"
        d = json.loads(p.read_text())
        return d if any(k in d for k in ("five_hour", "seven_day")) else None
    return _ttl("claude", 5, read)


def claude_status():
    """Why there is no number yet (shown under the dial)."""
    return _live["status"] if LIVE["claude"] and _live["status"] else "no data yet"


def _tail(path, size=400_000):
    with open(path, "rb") as f:
        f.seek(0, os.SEEK_END)
        n = f.tell()
        f.seek(max(0, n - size))
        return f.read().decode("utf-8", "ignore")


def _codex_limits(path):
    text, dec, found = _tail(path), json.JSONDecoder(), None
    i = text.rfind('"rate_limits":')
    while i >= 0 and found is None:
        try:
            obj, _ = dec.raw_decode(text[i + len('"rate_limits":'):].lstrip())
            if isinstance(obj, dict) and obj.get("primary"):
                found = obj
        except ValueError:
            pass
        i = text.rfind('"rate_limits":', 0, i)
    return found


def codex():
    def read():
        root = Path.home() / ".codex" / "sessions"
        files = sorted(root.glob("*/*/*/rollout-*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:6]
        for f in files:
            lim = _codex_limits(f)
            if lim:
                out = {"updated_at": int(f.stat().st_mtime)}
                for win in ("primary", "secondary"):
                    w = lim.get(win)
                    if isinstance(w, dict) and w.get("used_percent") is not None:
                        key = "five_hour" if (w.get("window_minutes") or 0) <= 600 else "seven_day"
                        out[key] = {"used_percentage": w["used_percent"], "resets_at": w.get("resets_at")}
                return out
        return None
    return _ttl("codex", 10, read)


PROVIDERS = {"claude": ("Claude", "#d97757", claude), "codex": ("Codex", "#10a37f", codex)}

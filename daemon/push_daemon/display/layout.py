"""Widget layout for the display body.

The body is a grid of 8 columns x 2 rows (each cell 120 x 50 px) between the two rows of button labels. A widget is
{"type", "col", "row", "w", "h", ...own settings}. The arrangement is one list of widgets: the shared one lives in settings["display_widgets"];
a profile may have its own in profile["display"]["widgets"], which then replaces the shared one. The player is one of the widgets
({"type": "player"}, 4 x 2 on the left or right half, or 2 x 2): media_ui.py draws it and makes its buttons.
"""
import time
from datetime import datetime

from .. import apps, claude_sessions, favicons, usage as usage_mod
from .tokens import TOKENS

DEFAULT = TOKENS["layout_default"]
FAV_COLORS = ["#ff6b6b", "#ffb340", "#f5e050", "#6ee686", "#4ac8c0", "#6aa7ff", "#c58bff", "#ff8fb1", "#b6f24a"]   # one colour per favourite: its button's light and its tile when open
CAPTION = {"five_hour": "5-hour", "seven_day": "Weekly"}


APPS = TOKENS["widget_apps"]
THEMES = {"neon": ("neon", "pixel"), "plasma": ("plasma", "pip"), "classic": ("classic", "classic")}   # Claude widget theme -> (progress bar, mascot)


def player_side(eng, prof):
    """Which half the large player takes: the profile's player_side, else the shared one, else left."""
    return ((prof or {}).get("display") or {}).get("player_side") or eng.settings.get("player_side") or "left"


def player_overlay(eng, prof):
    """The large (4 x 2) player the Layout button shows over one half of the display: {"type": "player", col, row, w, h}, or None while it is hidden.
    The half is the profile's player_side (else the shared one, else left)."""
    if (eng.settings.get("media") or {}).get("mode", "half") == "off" or eng.asks.waiting():   # a waiting question takes the player's place
        return None
    return {"type": "player", "col": 4 if player_side(eng, prof) == "right" else 0, "row": 0, "w": 4, "h": 2}


def ask_over(eng, prof, widgets):
    """The half of the display a waiting question takes ({col, row, w, h}): where the Claude session widget is, else the right half; None when nothing waits."""
    if not eng.asks.waiting():
        return None
    for d in widgets:
        if d.get("type") == "claude_session" and available(prof, d):
            return {"type": "ask_banner", "col": d["col"], "row": 0, "w": d["w"], "h": 2}
    return {"type": "ask_banner", "col": 4, "row": 0, "w": 4, "h": 2}


def covered(d, over):
    """Is widget d (partly) under the player shown over `over`? Covered widgets are not drawn and their buttons are quiet."""
    return bool(over) and d["col"] < over["col"] + over["w"] and d["col"] + d["w"] > over["col"]


def fit(d, over):
    """The widget as it is shown under the player: itself when clear of it; a browser widget squeezed into the columns the player leaves free
    (at least 2); None (hidden) when it is covered."""
    if not covered(d, over):
        return d
    if d.get("type") == "browser":
        if over["col"] > d["col"]:
            free = over["col"] - d["col"]
            if free >= 2:
                return {**d, "w": free}
        else:
            col = over["col"] + over["w"]
            free = d["col"] + d["w"] - col
            if free >= 2:
                return {**d, "col": col, "w": free}
    return None


def kind(d):
    """Which app group a widget belongs to ('claude', 'codex', 'tab'), or None for the global ones (clock, profile)."""
    t = d.get("type")
    return (d.get("provider") or "claude") if t == "usage" else "claude" if t == "claude_session" else "tab" if t in ("tab", "browser") else None


def available(prof, d):
    """App widgets exist only on a profile for one of their apps; the clock and profile widgets are everywhere."""
    apps = APPS.get(kind(d))
    return not apps or bool(set(((prof or {}).get("match") or {}).get("bundle_ids", [])) & set(apps))


def buttons_of(d):
    """The widget's table entry from tokens widget_buttons, or None."""
    for e in TOKENS["widget_buttons"]:
        if all((d.get(k) if k != "provider" else (d.get("provider") or "claude")) == v for k, v in e["match"].items()):
            return e
    return None


def widget_buttons(eng, prof, widgets, preview=False):
    """{display button id: control} for the buttons the widgets bring along (by display button id). Each control has what labels() has
    plus its action; `dim` marks buttons whose app is not in front (drawn faded, not pressable). Master carries the bar while this profile is locked."""
    out = {}
    accent = ((prof or {}).get("theme") or {}).get("accent", "#d97757")
    over = None if preview else (ask_over(eng, prof, widgets) or player_overlay(eng, prof))
    if over and over["type"] == "ask_banner":   # the question's own button, under the last column of its half
        out[f"btn-lower-{over['col'] + over['w']}"] = {"label": "", "icon": None, "pulse": True, "color": "#78b4ff", "dim": False, "action": {"type": "ask"}}
    for d in widgets:
        d = fit(d, over)
        if d is None:
            continue
        e = eng.clock_buttons(d.get("h") == 2) if (d.get("type") == "clock" and d.get("w") == 2 and not preview) else \
            eng.browser_buttons(d.get("w", 4)) if (d.get("type") == "browser" and not preview) else buttons_of(d)
        if e and d.get("type") == "claude_session" and not preview:   # the follow button shows the current choice
            e = {"edge": [e["edge"][0], {**e["edge"][1], "label": claude_sessions.FOLLOW_LABEL[eng.settings.get("claude_follow", "busy")]}]}
        if not e or d.get("type") == "player" or not available(prof, d):
            continue
        up, down = list(e.get("up", [])), list(e.get("down", []))
        if e.get("edge"):
            (up if d["row"] == 0 else down).extend(e["edge"])
        apps = APPS.get(kind(d))
        dim = bool(apps) and not preview and eng.front not in apps and d.get("type") != "browser"   # a saved tab opens from any app
        color = usage_mod.PROVIDERS.get(kind(d), (None, accent))[1] if d.get("type") == "usage" else accent
        for names, row in ((up, "upper"), (down, "lower")):
            for i, b in enumerate(names):
                if not b:
                    continue
                ctl = {"color": color, **b, "dim": dim}
                if b.get("pulse"):
                    ctl["pulse"] = True
                if (b.get("action") or {}).get("type") == "pin" and prof and eng.pinned == prof["id"]:
                    ctl["bar"] = True
                out[f"btn-{row}-{d['col'] + i + 1}"] = ctl
    return out


def arrangement(settings, prof):
    """The widgets on the display: the profile's own list when it has set one up, else the shared one."""
    mine = (((prof or {}).get("display") or {}).get("widgets"))
    if isinstance(mine, list):
        return mine
    shared = settings.get("display_widgets")
    return shared if isinstance(shared, list) and shared else DEFAULT


def _hue(host):
    """A steady colour per site for its monogram tile: the same host always gets the same one."""
    n = sum(ord(c) * (i + 3) for i, c in enumerate(host or "?"))
    return ["#d97757", "#6aa7ff", "#7ed37f", "#c58bff", "#f5c542", "#ff8fb1", "#4ac8c0"][n % 7]


def _eta(epoch):
    if not epoch:
        return ""
    s = int(epoch - time.time())
    if s <= 0:
        return "resets now"
    h, m = divmod(s // 60, 60)
    return f"resets in {h}h {m:02d}m" if h < 24 else f"resets in {h // 24}d {h % 24}h"


def _eta_short(epoch):
    if not epoch:
        return ""
    s = int(epoch - time.time())
    if s <= 0:
        return "now"
    h, m = divmod(s // 60, 60)
    return f"in {h}h {m:02d}m" if h < 24 else f"in {h // 24}d {h % 24}h"


def _k(n):
    """361378 -> '361k', 1000000 -> '1M'."""
    return f"{n / 1e6:g}M" if n >= 1e6 else f"{round(n / 1e3)}k"


def _level(pct):
    return "good" if pct < 60 else "warn" if pct < 85 else "bad"


def _cache_icon(eng, key, png):
    import io
    from PIL import Image
    eng.media.icon_cache[key] = (png, Image.open(io.BytesIO(png)).convert("RGBA"))
    return key


def icon_key(eng, prof, bundle=None):
    """Key of an icon in the media hub's icon cache (also served to the browser mirror), or ''. The profile's own app icon or picture;
    with none chosen, the icon of the first app that switches the profile on (the same rule the browser UI uses)."""
    cache = eng.media.icon_cache
    profile_icon = bundle is None and prof is not None
    if bundle is None:
        ic = (prof or {}).get("icon")
        if isinstance(ic, dict) and ic.get("type") == "image" and str(ic.get("data", "")).startswith("data:image"):
            import base64
            key = "img-" + (prof.get("id") or "") + "-" + format(hash(ic["data"]) & 0xffffffff, "x")   # a new picture gets a new key
            if key not in cache:
                try:
                    return _cache_icon(eng, key, base64.b64decode(ic["data"].split(",", 1)[1]))
                except Exception:  # noqa: BLE001
                    return ""
            return key
        if isinstance(ic, dict) and ic.get("type") == "app" and ic.get("bundle"):
            bundle = ic["bundle"]
        elif not ic:
            for b in ((prof or {}).get("match") or {}).get("bundle_ids", []):
                if apps.info(b).get("icon"):
                    bundle = b
                    break
    if bundle:
        key = "app-" + bundle
        if key not in cache:
            png = apps.info(bundle).get("icon")
            if png:
                _cache_icon(eng, key, png)
        if key in cache:
            return key
    return _glyph_key(eng, prof) if profile_icon else ""


def _glyph_key(eng, prof):
    """No picture and no app: the profile's abstract glyph, as the browser shows it (chosen, else one picked from the profile's id)."""
    import json
    from pathlib import Path
    names = list(json.loads((Path(__file__).parent / "glyphs.json").read_text()))
    ic = prof.get("icon")
    if isinstance(ic, dict) and ic.get("type") == "glyph":
        name = ic.get("name")
    else:
        h = 0
        for c in prof.get("id", ""):
            h = ((h * 31 + ord(c)) + 2 ** 31) % 2 ** 32 - 2 ** 31
        name = names[abs(h) % len(names)]
    accent = (prof.get("theme") or {}).get("accent", "#d97757")
    key = f"glyph-{name}-{accent}"
    if key not in eng.media.icon_cache:
        try:
            _cache_icon(eng, key, apps.glyph_png(name, accent))
        except Exception:  # noqa: BLE001
            return ""
    return key


def materialize(eng, prof, mode, widgets, live=True):
    """Widget definitions -> display spec widgets carrying the data they draw (so both renderers draw them identically)."""
    now = datetime.now()
    out = []
    over = (ask_over(eng, prof, widgets) or player_overlay(eng, prof)) if live else None
    for d in widgets:
        if d.get("type") == "player" or not available(prof, d) or (d := fit(d, over)) is None:   # the player is drawn by media_ui
            continue
        w = dict(d)
        t = d.get("type")
        if t in ("claude_session", "usage", "clock"):
            bar, mascot = THEMES.get(eng.settings.get("claude_theme"), THEMES["neon"])
            w["mascot"] = mascot
            if t == "claude_session":
                w["bar"] = bar
        if t == "profile":
            w.update(name=(prof or {}).get("name") or "No profile", mode=("Auto · last app" if mode.startswith("Auto ·") else mode) if prof else "", accent=((prof or {}).get("theme") or {}).get("accent", "#6b6b78"),
                     icon=icon_key(eng, prof))
        elif t == "clock":
            h12 = bool(eng.settings.get("clock_12h"))
            w.update(time=(now.strftime("%I:%M").lstrip("0") if h12 else now.strftime("%H:%M")), ampm=now.strftime("%p") if h12 else "",
                     date=now.strftime("%a %d %b" if d["w"] < 3 else "%A, %d %B"))
            if d.get("w") == 2 and eng.timer.state != "off":   # the 2-wide clocks turn into the timer
                w["timer"] = eng.timer.face()
        elif t == "usage":
            name, color, read = usage_mod.PROVIDERS.get(d.get("provider", "claude"), usage_mod.PROVIDERS["claude"])
            data = read() or {}
            claude = d.get("provider", "claude") == "claude"
            rows = []
            ctx = usage_mod.context() if (claude and (d.get("context") or d.get("which") == "context")) else None
            if claude and (d.get("context") or d.get("which") == "context"):   # the session's context window first, then the plan limits
                tk, win = (ctx or {}).get("tokens"), (ctx or {}).get("window") or 1
                rows.append({"label": "Context", "kind": "context", "pct": None if tk is None else round(100 * tk / win),
                             "sub": "" if tk is None else f"{_k(tk)} / {_k(win)}", "color": "info"})
            for which in (("five_hour", "seven_day") if d.get("which") == "both" else () if d.get("which") == "context" else (d.get("which", "five_hour"),)):
                u = data.get(which) or {}
                pct, reset = u.get("used_percentage"), u.get("resets_at")
                if pct is not None and reset and reset < time.time():   # the window has rolled over since the last reading
                    pct, sub = 0, "reset"
                else:
                    sub = (_eta_short(reset) if d.get("which") == "both" else _eta(reset)) if pct is not None else \
                          (usage_mod.claude_status() if claude else "no data yet")
                rows.append({"label": CAPTION.get(which, "Usage"), "kind": "limit", "pct": None if pct is None else round(pct), "sub": sub,
                             "color": "bad" if (pct or 0) >= 90 else "warn" if (pct or 0) >= 75 else "provider"})
            w.update(provider=name, provider_color=color, plan=usage_mod.plan() if claude else "", rows=rows, caption=rows[-1]["label"],
                     pct=rows[-1]["pct"], sub=rows[-1]["sub"], color=_level(rows[-1]["pct"] or 0))
        elif t == "claude_session":
            w.update(claude_sessions.snapshot(eng.settings.get("claude_follow", "busy"), eng.front))
            w["scroll"] = eng.claude_scroll.line_for(w.get("reply", ""))
        elif t == "browser":
            eng.want_tab_until = time.time() + 3
            eng.want_dl_until = time.time() + 3
            tab = eng.tab or {}
            host = tab.get("host") or ""
            favs = eng.settings.get("tab_favs") or []
            cap = eng.fav_cap(d.get("w", 4))
            page, pages = eng.fav_page_of(cap) if d.get("w", 4) >= 4 else (0, 1)
            pop = eng.fav_pop
            w.update(title=tab.get("title") or "No browser tab", host=host, idle=not tab, loading=bool(tab.get("loading")), secure=bool(tab.get("secure")),
                     saved=bool(tab.get("url")) and any(f["url"] == tab.get("url") for f in favs), n_saved=len(favs), page=page, pages=pages, mono=(host[:1] or "?").upper(), hue=_hue(host),
                     icon=eng.favicons.get(eng, favicons.origin(tab.get("url"))), dl=eng.dl.view(),
                     pop={"kind": pop["kind"], "age": time.time() - pop["t"]} if pop and time.time() - pop["t"] < 1.4 else None)
            if True:                                # the favourites are drawn as tiles over their buttons
                w["favs"] = [{"icon": eng.favicons.get(eng, favicons.origin(f["url"])), "mono": ((f.get("host") or "?")[:1]).upper(), "hue": _hue(f.get("host") or ""), "title": f.get("title", ""), "open": f["url"] == tab.get("url"), "color": FAV_COLORS[i % 9]}
                             for i, f in enumerate(favs[page * cap:(page + 1) * cap])]
        elif t == "download":
            eng.want_dl_until = time.time() + 3
            w["dl"] = eng.dl.view()
        elif t == "tab":
            eng.want_tab_until = time.time() + 3        # tells the engine to keep asking the browser
            bundle = eng._last_browser or "com.google.Chrome"
            tab = eng.tab or {}
            w.update(title=tab.get("title") or "No browser tab", host=tab.get("host") or "", icon=icon_key(eng, None, bundle), idle=not tab)
        else:
            continue
        out.append(w)
    if over and over["type"] == "ask_banner":     # the waiting question, drawn over its half
        _, a = eng.asks.current()
        qs = a["questions"]
        out.append({**over, "n": len(qs), "left": 0, "header": qs[0]["header"], "question": qs[0]["question"]})
    return out


def spec(eng, prof, mode, zones, active, view="full", toast=None, live=True):
    """A display spec made of the arrangement (the player, when it has one, is added by media_ui)."""
    accent = ((prof or {}).get("theme") or {}).get("accent", "#d97757")
    widgets = materialize(eng, prof, mode, arrangement(eng.settings, prof), live)
    return {"accent": accent, "zones": zones, "active": sorted(active), "widgets": widgets, "toast": toast, "view": view}

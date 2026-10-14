"""Media on the Push: the player widget, its buttons and the strip seek, for every profile.

Two players: the large 4 x 2 one, shown by the Layout button over the left or right half of the display (covering the widgets there; it can open
Browse), and a compact 2 x 2 one that is a widget in the layout. Only one is on screen at a time.
"""
import time

from .display import layout as layout_mod, library
from . import registry as R

MODES = ["half", "off"]   # shown / hidden with the Layout button
DEFAULTS = {"mode": "half", "idle": "last", "chrome": True, "spotify_desktop": True, "system": True, "auto_show": True, "favorites": []}
MODE_BTN = "btn-layout"  # the Layout button (not a display button), so all eight display buttons stay free for the player and Browse
# Encoders that scroll an open list: the parent column (queue, playlists) and the songs inside a playlist. They sit above the list's half:
# list on the left half = Encoders 1 and 3, list on the right half = Encoders 5 and 7.
SCROLL_KNOBS = {"left": ("knob-1", "knob-3"), "right": ("knob-5", "knob-7")}
SCROLL_TICKS = 4       # encoder ticks per row
ROWS = 5               # rows the list shows at once
TRANSPORT = {"btn-play": "play", "arrow-left": "prev", "arrow-right": "next"}  # used only when the profile gives them no action
WHITE, DIM = (200, 200, 200), (60, 60, 60)


def cfg(eng) -> dict:
    c = {**DEFAULTS, **(eng.settings.get("media") or {})}
    if c["idle"] not in ("last", "empty"):   # the quiet visualizer and "show the profile" are gone
        c["idle"] = "last"
    if c["mode"] == "full":   # the full-width player is gone: the player is always 4 columns x 2 rows
        c["mode"] = "half"
    return c


def set_cfg(eng, **kw):
    eng.settings["media"] = {**cfg(eng), **kw}
    from . import settings
    settings.save(eng.settings)
    eng._leds_for = None
    eng.broadcast({"type": "settings", "settings": eng.settings})


BIG = ("Couldn't", "Connect", "Can't", "Not available", "Spotify Premium", "Spotify answered")  # messages that need action keep the full screen
PILL_ICON = (("Saved", "heartfill"), ("Liked", "thumbupfill"), ("Removed like", "thumbup"), ("Removed", "heart"), ("Queue shuffled", "shuffle"), ("Added", "plus"), ("Shuffle", "shuffle"), ("Repeat", "repeat"))


def notify(eng, msg):
    """Only a message that needs the user to do something is shown (full screen); plain confirmations (Saved, Shuffle on...) are not."""
    if msg.startswith(BIG):
        eng.flash(msg, ok=False, seconds=2.4)


def auto_show(eng, prof):
    """Music just started playing while the large player is hidden: slide it in (unless turned off in Settings). Hiding it later sticks until the next start."""
    playing = bool(eng.media.playing())
    was, eng._was_playing = getattr(eng, "_was_playing", None), playing
    if playing and was is False and cfg(eng)["auto_show"] and cfg(eng)["mode"] == "off":
        set_cfg(eng, mode="half")
        eng.slide_next = (layout_mod.player_side(eng, prof), True, time.time())


def cycle_mode(eng):
    m = cfg(eng)["mode"]
    new = MODES[(MODES.index(m) + 1) % len(MODES)] if m in MODES else "half"
    set_cfg(eng, mode=new)
    eng.slide_next = (layout_mod.player_side(eng, eng.active()), new == "half", time.time())   # the player slides in / out (no message)


def player_in(widgets):
    """The compact (2 x 2) player placed in a list of layout entries, or None. (The large one is not a list entry: it is the overlay below.)"""
    d = next((x for x in widgets if x.get("type") == "player" and int(x.get("w", 2)) < 4), None)
    return dict(d) if d else None


def player_def(eng, prof):
    """The player on screen: the large one the Layout button shows over one half (see layout.player_overlay), else the compact one placed in the layout, else None."""
    if eng.asks.waiting():   # a waiting question takes the player's place
        return None
    return layout_mod.player_overlay(eng, prof) or player_in(layout_mod.arrangement(eng.settings, prof))


def owned(d):
    """The display buttons under a player widget: they belong to the player, whatever the profile has on them."""
    if not d:
        return set()
    return {f"btn-{row}-{int(d['col']) + i + 1}" for row in ("upper", "lower") for i in range(int(d.get("w", 4)))}


def buttons(col, size=4):
    """-> {control id: op} for the media buttons, from the player's first column. Same places every time so the hands learn them.
    4 wide: Play, Prev, Next, Save below; Shuffle, Repeat, (gap), Browse above. 2 wide: Prev, Next above; Play, Save below."""
    if size >= 4:
        m = {f"btn-lower-{col + i}": op for i, op in ((1, "play"), (2, "prev"), (3, "next"), (4, "like"))}
        m.update({f"btn-upper-{col + i}": op for i, op in ((1, "shuffle"), (2, "repeat"), (4, "browse"))})
    else:
        m = {f"btn-upper-{col + i}": op for i, op in ((1, "prev"), (2, "next"))}
        m.update({f"btn-lower-{col + i}": op for i, op in ((1, "play"), (2, "like"))})
    return m


def _zone(eng, op):
    t = eng.media.track or {}
    caps = t.get("caps", [])
    if op == "prev":
        return {"label": "Prev", "icon": "prev"}
    if op == "next":
        return {"label": "Next", "icon": "next"}
    if op == "play":
        return {"label": "Pause", "icon": "pause"} if t.get("playing") else {"label": "Play", "icon": "play"}
    if op == "like":  # Spotify says Save, YouTube Music says Like: same thing
        if "like" not in caps:
            return {}
        yt = t.get("service") == "ytm" or "music.youtube.com" in (t.get("web") or "")
        word = "Like" if yt else "Save"
        mark, markfill = ("thumbup", "thumbupfill") if yt else ("heart", "heartfill")  # YouTube's thumbs-up, Spotify's heart
        if t.get("liked"):
            return {"label": word + "d", "icon": markfill, "icon_color": t.get("brand") or "#1ed760"}
        return {"label": word, "icon": mark}
    if op in ("shuffle", "repeat"):
        return {"label": op.title(), "icon": op} if op in caps else {}
    if op == "browse":
        return {"label": "Browse", "icon": "list"} if eng.media.browse_src() else {}
    return {}


def _lit(eng, op) -> bool:
    t = eng.media.track or {}
    if op == "like":
        return bool(t.get("liked"))
    if op in ("shuffle", "repeat"):
        return bool(t.get(op))
    return False


def scene(eng, prof, mode_text, toast):
    """The display spec when the player is on, else None (the profile's full arrangement draws). Also sets eng.media_map."""
    c, hub = cfg(eng), eng.media
    d = player_def(eng, prof)
    zones = eng.zones_for(prof)
    accent = (prof or {}).get("theme", {}).get("accent", "#d97757")
    _t = hub.snapshot()
    tint = (_t.get("track") or {}).get("brand") or _t.get("tint") or "#3d8bff"  # the player's own colour: its source's (Spotify green, ...), else the artwork's
    eng.media_map = {MODE_BTN: "mode"}
    br = getattr(eng, "browse", None)
    if br and (not d or d["w"] < 4):  # Browse stays open until Back (or the player is hidden or removed from the layout)
        eng.browse = br = None
    if not d:
        eng.media_ui = None
        return None
    active_now = hub.active()
    idle = ""
    if not active_now:
        idle = "empty" if c["idle"] == "empty" or not hub.track.get("title") else ""   # else "last": the last track, paused
    layout = "left" if d["col"] < 4 else "right"   # which half a 4-wide player is on (Browse opens in the other)
    snap = hub.snapshot()
    pending = eng.seek_pending
    w = library.now_playing_widget(d, snap, hub.position(), idle, pending)
    if d["w"] >= 4:   # the volume meter lives inside the big player only
        w["volume"] = int(eng.volume)
        w["vol_glow"] = time.time() < eng.vol_glow_until
    if not active_now and not idle:  # "last": the last track, paused
        w["playing"] = False
    now_t, pp = time.time(), getattr(eng, "_pp", None)
    if pp is None or pp[0] != w["playing"]:
        eng._pp = pp = (w["playing"], now_t if pp is not None else 0.0)
    if not w["playing"]:
        w["glyph"], w["glyph_icon"] = 1.0, "pause"
    elif pp[1]:  # just resumed: a play glyph that fades out
        w["glyph"], w["glyph_icon"] = round(max(0.0, 1 - (now_t - pp[1]) / 0.7), 1), "play"
    on = set()
    if br and not idle:
        return _browse_scene(eng, br, w, tint, toast, layout, mode_text)
    if not idle or idle == "":
        bm = buttons(d["col"], d["w"])
        for cid, op in bm.items():
            z = _zone(eng, op)
            if z:
                zones[cid] = {**z, "bar_color": tint, "lit": _lit(eng, op)}  # lit = bold label (saved, shuffle on); the bar is only for a press
                eng.media_map[cid] = op
    if not idle:
        eng.media_map.update({k: v for k, v in TRANSPORT.items() if v in (eng.media.track or {}).get("caps", [])})
    active = frozenset(eng.pressed) | frozenset(on)
    spec = layout_mod.spec(eng, prof, mode_text, zones, active, "full", toast)   # the other widgets of the arrangement
    spec["widgets"].append(w)                                                    # the player
    eng.media_ui = {"layout": layout, "browse": False, "w": d["w"]}
    spec["view"] = f"{d['w']}{layout}|{idle}"
    return spec


ARROW_MAP = {"arrow-up": "b:up", "arrow-down": "b:down", "arrow-right": "b:select", "arrow-left": "b:back"}  # the Play button stays play/pause


def _focus(br):
    """The column that has the focus: (items, selected index holder). Level 1 is the songs inside the selected playlist."""
    return (br["sub"], "sub") if br["level"] == 1 else (br, "top")


SCROLL_AFTER = 3.0   # a long title on the selected row starts sliding once the selection has rested this long


def _col(items, sel, note, focus, rest=0.0):
    top = max(0, min(sel - 2, len(items) - ROWS))
    rows = [{"text": it["text"], "on": top + i == sel} for i, it in enumerate(items[top:top + ROWS])]
    if focus and rest > SCROLL_AFTER:
        for r in rows:
            if r["on"]:
                r["scroll"] = round((rest - SCROLL_AFTER) * 30) / 30
    return {"rows": rows, "focus": focus,
            "empty": note if not items else "", "above": top, "more": max(0, len(items) - top - ROWS)}


def _browse_scene(eng, br, w, tint, toast, layout, mode):
    """Browse: the list takes the side the profile had (Full turns into a split) and the player and its buttons stay on the other side.
    The list's buttons sit in fixed places: Play now, Select, (empty), Back above; Queue and Playlists below."""
    zones = {cid: {} for cid in R.UPPER + R.LOWER}
    eng.media_map = {MODE_BTN: "mode", **ARROW_MAP, "btn-play": "play"}  # the global Play button keeps toggling play/pause while Browse is open
    on = set()
    base = 4 if layout == "right" else 0          # the player's side
    for cid, op in buttons(base, 4).items():
        z = _zone(eng, op)
        if z:
            zones[cid] = {**z, "bar_color": tint, "lit": _lit(eng, op)}
            eng.media_map[cid] = op
    lb = 0 if base == 4 else 4                    # the list's side
    cur = br["items"][br["sel"]] if br["items"] else None
    two = br["tab"] in ("mine", "favorites")
    can_select = two and br["level"] == 0 and bool(cur and cur.get("can_open", True))
    plist = br["tab"] in ("mine", "public", "favorites") and br["level"] == 0 and bool(cur)
    fav = bool(cur) and cur["uri"] in cfg(eng)["favorites"]
    # Fixed places. Queue: Play now, Back. Playlists: Select, Favorite (or Add to queue inside a playlist), Play now, Back
    second = ((2, "b:addq", "Add to queue", "plus", False) if br["level"] == 1 and br.get("src") != "ytm" else
              (2, "b:fav", "Favorited" if fav else "Favorite", "starfill" if fav else "star", fav) if plist else None)
    play_slot = 1 if br["tab"] == "queue" else 3   # the queue: Play now first; any playlist view: Select, Favorite, Play now, Back
    upper = ((1, "b:select", "Select", "chevron", False) if can_select else None, second, (play_slot, "b:play", "Play now", "play", False), (4, "b:back", ("Back", "backarrow") if br["level"] == 1 else ("Close", "x"), None, False))
    for slot in upper:
        if slot:
            i, op, label, icon, lit = slot
            if isinstance(label, tuple):   # (label, icon): Back (arrow) inside a playlist, Close (X) at the top level
                label, icon = label
            zones[f"btn-upper-{lb + i}"] = {"label": label, "icon": icon, "keep_case": False, "bar_color": tint, "lit": lit,
                                            **({"icon_color": tint} if lit else {})}
            eng.media_map[f"btn-upper-{lb + i}"] = op
    tabs = ((("b:queue", "Queue", "list", "queue"), ("b:mine", "Playlists", "music", "mine"), None, ("b:favorites", "Favorites", "star", "favorites"))
            if br.get("src") == "ytm" else
            (("b:queue", "Queue", "list", "queue"), ("b:mine", "My playlists", "music", "mine"), ("b:public", "Public", "link", "public"),
             ("b:favorites", "Favorites", "star", "favorites")))
    for i, t_ in enumerate(tabs):
        if not t_:
            continue
        op, label, icon, tab = t_
        zones[f"btn-lower-{lb + 1 + i}"] = {"label": label, "icon": icon, "keep_case": False, "bar": br["tab"] == tab, "bar_color": tint}  # the open list: a bar under the label
        eng.media_map[f"btn-lower-{lb + 1 + i}"] = op
    key = (br["tab"], br["level"], br["sel"], br["sub"].get("sel"), br["sub"].get("uri"), len(br["items"]), len(br["sub"]["items"]))
    if br.get("_key") != key:   # the selection moved: the dwell clock for the sliding title starts again
        br["_key"], br["_rest_at"] = key, time.time()
    rest = time.time() - br["_rest_at"]
    cols = [_col(br["items"], br["sel"], br["note"], br["level"] == 0, rest)]
    if two:
        sub = br["sub"]
        cols.append(_col(sub["items"], sub["sel"], sub["note"] if br["level"] == 1 else "", br["level"] == 1, rest) if br["level"] == 1 else
                    {"rows": [], "focus": False, "above": 0, "more": 0,
                     "empty": "Select to see songs" if (not cur or cur.get("can_open", True)) else "Spotify only opens playlists you made"})
    lw = {"type": "browse", "tint": w.get("brand") or w["tint"], "tint2": w.get("brand") or w["tint2"], "x0": lb * 120, "x1": lb * 120 + 480, "cols": cols}
    eng.media_ui = {"layout": layout, "browse": True, "w": 4}
    spec = library.media_scene(tint, zones, frozenset(eng.pressed) | on, [w, lw], toast)
    spec["view"] = f"{layout}|browse"
    return spec


def _open_browse(eng, tab="queue"):
    import asyncio
    src = eng.media.browse_src()
    eng.browse = {"tab": tab, "src": src, "items": [], "sel": 0, "at": time.time(), "note": "Loading...", "level": 0,
                  "sub": {"items": [], "sel": 0, "note": "", "uri": ""}}
    br = eng.browse

    async def load():
        items, note = await eng.media.browse_items(tab, src)
        if eng.browse is br:
            br["items"], br["note"], br["at"] = items, note, time.time()
    asyncio.ensure_future(load())


def _load_sub(eng, br, uri):
    import asyncio
    sub = br["sub"] = {"items": [], "sel": 0, "note": "Loading...", "uri": uri}

    async def load():
        items, note = await eng.media.playlist_items(uri)
        if eng.browse is br and br["sub"] is sub:
            sub["items"], sub["note"] = items, note
    asyncio.ensure_future(load())


def _scroll(eng, steps, child=None):
    """Move a column. child=None (arrows): the focused one; False: the parent (Encoder 1); True: the songs inside a playlist (Encoder 3)."""
    br = eng.browse
    br["at"] = time.time()
    if child is None:
        col = _focus(br)[0]
    else:
        col = br["sub"] if child else br
    if not col["items"]:
        return
    old = col["sel"]
    col["sel"] = max(0, min(len(col["items"]) - 1, old + steps))
    if col is br and br["level"] == 1 and col["sel"] != old:  # another playlist while one is open: its songs load
        pl = br["items"][br["sel"]]
        if pl.get("can_open", True):
            _load_sub(eng, br, pl["uri"])
        else:
            br["level"] = 0


def _browse_op(eng, op):
    import asyncio
    br = eng.browse
    br["at"] = time.time()
    if op == "b:back":
        if br["level"] == 1:
            br["level"] = 0
        else:
            eng.browse = None
    elif op in ("b:queue", "b:mine", "b:public", "b:favorites"):
        if br["tab"] != op[2:]:
            _open_browse(eng, op[2:])
    elif op in ("b:up", "b:down"):
        _scroll(eng, 1 if op == "b:down" else -1)
    elif op == "b:select" and br["tab"] in ("mine", "favorites") and br["level"] == 0 and br["items"]:
        br["level"] = 1
        _load_sub(eng, br, br["items"][br["sel"]]["uri"])
    elif op == "b:fav" and br["level"] == 0 and br["items"] and br["tab"] != "queue":
        uri = br["items"][br["sel"]]["uri"]
        favs = list(cfg(eng)["favorites"])
        favs.remove(uri) if uri in favs else favs.append(uri)
        set_cfg(eng, favorites=favs)
        if br["tab"] == "favorites" and uri not in favs:  # taken off the list you are looking at
            br["items"].pop(br["sel"])
            br["sel"] = max(0, min(br["sel"], len(br["items"]) - 1))
            br["note"] = "No favorites yet: press Favorite on a playlist"
    elif op == "b:addq" and br["level"] == 1 and br["sub"]["items"]:
        uri = br["sub"]["items"][br["sub"]["sel"]]["uri"]

        async def add():
            notify(eng, await eng.media.queue_add(uri))
        asyncio.ensure_future(add())
    elif op == "b:play":
        col, _ = _focus(br)
        if not col["items"]:
            return
        item, idx, tab, ctx = col["items"][col["sel"]], col["sel"], br["tab"], (br["sub"]["uri"] if br["level"] == 1 else "")
        # Browse stays open: only Back closes it

        async def go():
            if not await eng.media.browse_pick(tab, item, idx, ctx):  # it just starts playing; only a failure is worth saying
                eng.flash("Couldn't start that", ok=False, seconds=2.4)
            elif tab == "queue" and eng.browse is br:  # the queue moved on: show the new one
                await asyncio.sleep(0.8)
                items, note = await eng.media.browse_items("queue", br.get("src", ""))
                if eng.browse is br and br["tab"] == "queue":
                    br["items"], br["note"], br["sel"] = items, note, 0
        asyncio.ensure_future(go())


def handle(eng, ev) -> bool:
    """Called for every input before profiles see it. True = consumed."""
    cid, kind = ev["control"], ev["kind"]
    if cid == MODE_BTN:
        if kind == "press":
            cycle_mode(eng)
        return True
    if cid == "touch-strip":
        return _strip(eng, ev)
    br = getattr(eng, "browse", None)
    parent_k, child_k = SCROLL_KNOBS["left" if (eng.media_ui or {}).get("layout") == "right" else "right"]  # the player on the right = the list on the left
    if br and kind == "turn" and (cid == parent_k or (cid == child_k and br["level"] == 1)):
        # Encoder 1 only moves the parent column; Encoder 3 only moves the songs inside an opened playlist (Ableton-style browsing)
        if eng.knob_is_live(cid) and 0 < abs(ev["value"]) <= 20:
            acc = getattr(eng, "scroll_acc", {})
            acc[cid] = acc.get(cid, 0) + ev["value"]
            eng.scroll_acc = acc
            steps = int(acc[cid] / SCROLL_TICKS)
            if steps:
                acc[cid] -= steps * SCROLL_TICKS
                _scroll(eng, steps, child=cid == child_k)
        return True
    if kind != "press":
        return False
    op = eng.media_map.get(cid)
    if not op:
        return False
    if op.startswith("b:"):
        if getattr(eng, "browse", None):
            _browse_op(eng, op)
        return True
    if op == "browse":
        if getattr(eng, "browse", None):
            eng.browse = None
        else:
            _open_browse(eng)
        return True
    if cid in TRANSPORT:  # a profile's own action on this button wins
        prof = eng.active()
        if (eng.controls_for(prof).get(cid) or {}).get("action"):
            return False
    import asyncio

    async def go():
        msg = await eng.media.command(op)
        if msg:
            notify(eng, msg)
    asyncio.ensure_future(go())
    return True


def _strip(eng, ev) -> bool:
    t = eng.media.track or {}
    if not eng.media_ui or "seek" not in t.get("caps", []) or not t.get("duration"):
        return False
    k = ev["kind"]
    now = time.time()
    hist = getattr(eng, "strip_hist", None)
    if k == "touch":
        eng.seek_pending, eng.strip_hist = None, []
    elif k == "move":
        if hist is None:
            hist = eng.strip_hist = []
        if ev["value"] != 0:  # the strip springs back to 0 when the finger lifts: that is not a position
            hist.append((now, max(0.0, min(1.0, (ev["value"] + 8192) / 16383))))
            del hist[:-30]
            eng.seek_pending = hist[-1][1]
    elif k == "untouch":
        # the spring-back can arrive just before the release: take the last position from before the lift
        frac = None
        for ts, f in reversed(hist or []):
            if now - ts >= 0.08:
                frac = f
                break
        if frac is None and hist:
            frac = hist[0][1]
        eng.seek_pending, eng.strip_hist = None, []
        if frac is not None:
            import asyncio
            asyncio.ensure_future(eng.media.command("seek", frac))
    return True


def leds(eng) -> dict:
    """LED colours for the media buttons that are live right now."""
    out = {}
    c = cfg(eng)
    out[MODE_BTN] = (255, 170, 40) if c["mode"] != "off" else DIM
    if not eng.media_ui:
        return out
    t = eng.media.track or {}
    for cid, op in eng.media_map.items():
        if cid == MODE_BTN:
            continue
        if op == "play":
            out[cid] = (60, 220, 110) if t.get("playing") else WHITE
        elif op == "like":
            out[cid] = (255, 80, 140) if t.get("liked") else (120, 120, 120)
        elif op in ("shuffle", "repeat"):
            out[cid] = (80, 200, 255) if t.get(op) else (90, 90, 90)
        else:
            out[cid] = (170, 170, 170)
    return out


def led_signature(eng):
    t = eng.media.track or {}
    return (cfg(eng)["mode"], t.get("playing"), t.get("liked"), t.get("shuffle"), t.get("repeat"), bool(eng.media_ui),
            tuple(sorted((eng.media_ui or {}).items())), tuple(sorted(eng.media_map.items())))

"""Engine: ties device events, profiles, scenes, actions, tests and the UI together."""
import asyncio
import io
import json
import subprocess
import time
from pathlib import Path

from . import actions, asks, downloads, favicons, limits, clock_timer, color, frontmost, usage, media_ui, migrate, permissions, profiles, scenes, settings, tabs, volume
from .display import layout, library, render
from .media import MediaHub
from . import registry as R
from .device import Push
from .tests_runner import TESTS_META, Runner

CONFIRM_WINDOW = 2.0
WAKE_INDICATOR = "btn-user"
GLOBAL_INFO = {"brightness": ("Brightness", "sun"), "display": ("Display brightness", "sun"), "leds": ("Pad & button brightness", "grid"), "volume": ("Volume", "volume")}
HUD_SECONDS = 1.4
UNUSED_KNOBS = {"knob-tempo", "knob-swing", "knob-master"}  # user: do not use the two far-left and the far-right encoders
KNOB_LOG = Path("/tmp/push_knob_events.log")
CALIBRATE_KEY = "btn-setup"  # Shift + Setup starts the colour calibration test


class Engine:
    def __init__(self):
        self.loop = asyncio.get_running_loop()
        self.settings = settings.load()
        color.set_calibration(self.settings.get("calibration"))
        usage.LIVE["claude"] = bool(self.settings.get("claude_usage_live"))
        usage.CONTEXT_WINDOW[0] = int(self.settings.get("claude_context_window") or 1_000_000)
        self.hud = None  # popup for global knobs: {label,icon,value,text,until}
        self._settings_dirty = False
        self.volume = 50
        self.vol_turn_at = 0.0
        self.vol_glow_until = 0.0
        self.browse = None  # the queue / playlist list screen: {tab, items, sel, at, note}
        self.strip_hist = []
        self._vol_read_at = 0.0
        self.volume_ctl = volume.Volume(lambda v: self.loop.call_soon_threadsafe(self._volume_changed, v))
        self.knob_touch: dict[str, tuple[bool, float]] = {}
        self.event_tap = None  # tests can consume raw events: fn(ev) -> bool (True = consumed)
        self._settings_pending = False
        self.press_waiter = None  # (future, allowed control ids) while a test waits for a button
        self.profiles = profiles.load_all()
        self.fix_slots()
        self.pinned: str | None = None
        self.front = ""
        self.timer = clock_timer.Timer()
        from . import claude_sessions
        self.claude_scroll = claude_sessions.Scroll()
        self.asks = asks.Asks(self)
        self.limits = limits.Limits(self)
        self.status = {"usb": False, "midi": False}
        self.clients: set = set()
        self.preview = False
        self.asleep = False
        self.last_input = time.time()
        self.pending_confirm: dict[str, float] = {}
        self.overlay = None  # (image, until)
        self.test_running = False
        self.repeat_color = (255, 255, 255)
        self.runner = Runner()
        self.pressed: set[str] = set()
        self.tab = None              # the browser's active tab {title, host} while a tab widget is on screen
        self.want_tab_until = 0.0
        self.want_dl_until = 0.0
        self.dl = downloads.Tracker()
        self.favicons = favicons.Favicons()
        self.fav_page = 0            # which page of favourites the browser widgets show
        self.fav_pop = None          # a favourite was just added / removed: {"kind", "t"}; the browser widget shows a tiny animation for a moment
        self._tab_busy = False
        self._last_browser = None    # bundle id of the browser used last
        self._released: dict = {}   # control id -> when it was released (the strip's light fades out)
        self._pill_since = None
        self._view = None
        self._trans = None
        self._fps = 0
        self.slide_next = None   # (side, entering, when): the next view change is the player sliding in / out
        self.standby = bool(self.settings.get("standby"))
        self.push = Push(self.loop, self.on_event, self.on_status)
        self.ctx = self  # tests read .push and .status
        self._leds_for = None
        self.loop.call_later(1.5, self.apply_hardware)
        self.volume_ctl.request_read()  # learn the real system volume at start
        self.mirror: dict = {}  # ws -> 'off' | 'stream' | 'render'
        self.lock_armed_until = 0.0  # Master pressed: waiting for a profile button until this time
        self._armed_pub = False
        self.override = self.override_front = None  # profile picked with a scene button, valid while the same app stays in front
        self.last_profile = None  # shown while the frontmost app has no profile of its own
        self.scene: dict = {}
        self._scene_json = ''
        self.media_map: dict = {media_ui.MODE_BTN: "mode"}  # control id -> media op while the visualizer owns those buttons
        self.media_ui = None
        self.seek_pending = None
        self.media = MediaHub(lambda: self.settings, self._media_changed)
        render.ICON_LOOKUP = lambda key: (self.media.icon_cache.get(key) or (None, None))[1]
        render.ART_LOOKUP = lambda key: (self.media.art_cache.get(key) or (None, None, None))[1]
        self.media.start()
        migrate.global_pads(self)
        migrate.widget_buttons(self)
        migrate.single_layout(self)
        migrate.player_overlay(self)
        migrate.alerts_simplified(self)

    # ---------- profile selection ----------
    def fix_slots(self):
        """Give every profile its own scene slot (see profiles.normalize_slots) and write back the ones that changed."""
        before = {k: p.get("slot") for k, p in self.profiles.items()}
        if profiles.normalize_slots(self.profiles):
            for k, p in self.profiles.items():
                if p.get("slot") != before.get(k):
                    profiles.save(p)

    def at_slot(self, i):
        return next((p for p in self.profiles.values() if p.get("slot") == i), None)

    def ordered(self):
        return sorted(self.profiles.values(), key=lambda p: (p.get("slot", 99), p["id"]))

    def active(self):
        """The pinned profile, else the one that matches the frontmost app. An app with no profile keeps the last one."""
        if self.pinned in self.profiles:
            self.last_profile = self.pinned
            return self.profiles[self.pinned]
        if self.override in self.profiles and self.front == self.override_front:  # a scene button, until the app changes
            self.last_profile = self.override
            return self.profiles[self.override]
        self.override = None
        for p in self.ordered():
            if self.front and self.front in p.get("match", {}).get("bundle_ids", []):
                self.last_profile = p["id"]
                return p
        return self.profiles.get(self.last_profile)

    # ---------- input ----------
    def on_status(self, status):
        if status.get("usb") and status.get("midi") and not (self.status.get("usb") and self.status.get("midi")):
            self.loop.call_later(1.2, self.apply_hardware)  # re-apply brightness after (re)connect
        self.status = status
        self._leds_for = None
        self.broadcast({"type": "status", "status": status})

    def on_event(self, ev):
        if self.standby:
            return
        self.last_input = time.time()
        if self.asleep:
            if ev["kind"] in ("press", "touch", "turn"):
                self.wake()
            return  # the waking input is swallowed
        if self.preview:
            self.broadcast({"type": "input", **ev})
        self.dispatch(ev)

    # ---------- global controls (always available, in every profile) ----------
    def _volume_changed(self, v):
        if v is None or time.time() - self.vol_turn_at < 0.8:  # a knob is being turned: the target on screen is the truth
            return
        self.volume = v
        self.broadcast({"type": "volume", "value": v})
        if self.hud and self.hud.get("which") == "volume" and time.time() < self.hud["until"]:  # only refresh a pop-up that is still showing
            self.hud.update(value=v, text=f"{v}%", icon="mute" if v == 0 else "volume", until=time.time() + HUD_SECONDS)

    def apply_hardware(self):
        self.push.sysex([0x06, int(self.settings["brightness"] * 1.27)])
        v = int(self.settings["display_brightness"] * 2.55)
        self.push.sysex([0x08, v & 0x7F, v >> 7])

    def knob_is_live(self, cid):
        """A real turn always comes with the knob's touch sensor. Ignore turns from an untouched knob (electrical noise)."""
        if not self.settings.get("require_touch", True):
            return True
        touched, t = self.knob_touch.get(cid, (False, 0))
        return touched or time.time() - t < 0.4

    def log_knob(self, cid, kind, value, accepted):
        try:
            if KNOB_LOG.exists() and KNOB_LOG.stat().st_size > 500_000:
                KNOB_LOG.write_text("")
            with KNOB_LOG.open("a") as f:
                f.write(f"{time.strftime('%H:%M:%S')} {cid} {kind} {value} {'ok' if accepted else 'IGNORED'}\n")
        except OSError:
            pass

    def knob_step(self):
        """Percent per encoder tick so that settings['knob_turns_full_range'] full turns span 0 to 100."""
        ticks = max(8.0, float(self.settings.get("knob_ticks_per_turn", 128)))
        return 100.0 / (float(self.settings.get("knob_turns_full_range", 2.5)) * ticks)

    def global_knob(self, cid, kind, value):
        which = self.settings["global_knobs"][cid]
        label, icon = GLOBAL_INFO[which]
        if kind == "turn":
            if value == 0 or abs(value) > 20 or not self.knob_is_live(cid):
                self.log_knob(cid, kind, value, False)
                return
            self.log_knob(cid, kind, value, True)
            delta = value * self.knob_step()
            if which == "volume":
                cur = max(0.0, min(100.0, self.volume + delta))
                self.volume = cur
                self.vol_turn_at = time.time()
                self.volume_ctl.set_target(cur)
            elif which == "brightness":  # display and pads together, keeping the gap between them
                cur = max(5, min(100, self.settings["display_brightness"] + delta))
                real = cur - self.settings["display_brightness"]
                self.settings["display_brightness"] = cur
                self.settings["brightness"] = max(5, min(100, self.settings["brightness"] + real))
                self._settings_dirty = True
                self._settings_pending = True
                self.apply_hardware()
            else:
                key = "display_brightness" if which == "display" else "brightness"
                cur = max(5, min(100, self.settings[key] + delta))
                self.settings[key] = cur
                self._settings_dirty = True
                self._settings_pending = True  # the UI ring follows live
                self.apply_hardware()
        elif kind == "touch":
            if which == "volume":
                self.volume_ctl.request_read()
            cur = self.volume if which == "volume" else self.settings["brightness" if which == "leds" else "display_brightness"]
        else:
            return
        if which == "volume" and cur == 0:
            icon = "mute"
        if which == "volume" and self.media_ui and self.media_ui.get("w", 4) >= 4:  # the (big) player's own volume meter is on screen: it moves and lights up instead of a pop-up
            self.vol_glow_until = time.time() + 1.5
            return
        self.hud = {"which": which, "label": label, "icon": icon, "value": cur, "text": f"{int(cur)}%", "until": time.time() + HUD_SECONDS}

    # ---------- standby ("turn the Push off") ----------
    def show_standby(self):
        """Display a message, every LED off, and (see dispatch/on_event) ignore all input."""
        self.push.clear_leds(force=True)
        self.push.set_strip([0] * 31)
        spec = library.standby()
        self.push.set_frame(render.draw(spec))
        self.publish_scene("standby", spec)

    async def set_standby(self, on: bool):
        self.standby = on
        self.settings["standby"] = on
        settings.save(self.settings)
        if on:
            self.hud = None
            self.pressed.clear()
            self.press_waiter = None
            self.overlay = None
            self.push.display_on = True
            self.show_standby()
        else:
            self.last_input = time.time()
            self.asleep = False
            self._leds_for = None
        self.broadcast({"type": "standby", "standby": on})
        self.broadcast({"type": "settings", "settings": self.settings})

    def dispatch(self, ev):
        cid, kind = ev["control"], ev["kind"]
        if self.standby:
            return
        if self.event_tap and self.event_tap(ev):
            return
        if kind in ("touch", "untouch") and cid.startswith("knob-"):   # the noise guard needs to see touches even while the question card takes the events
            self.knob_touch[cid] = (kind == "touch", time.time())
        if (self.asks.on or self.asks.fullscreen()) and self.asks.handle(ev):   # the question card has the whole device while it is open
            return
        if self.limits.active() and ev["kind"] == "press":   # any button dismisses a usage-limit alert
            self.limits.dismiss()
            return
        if cid in UNUSED_KNOBS and cid not in self.settings["global_knobs"]:
            return  # Tempo, Swing and Master do nothing unless the user assigns a function to them
        if kind in ("touch", "untouch") and cid.startswith("knob-"):
            self.knob_touch[cid] = (kind == "touch", time.time())
        if kind == "turn" and self.timer.state == "set" and cid in self.timer_knobs():   # the timer's dial: the left encoder over a 2 x 1 clock
            if self.knob_is_live(cid) and 0 < abs(ev["value"]) <= 20:
                self.timer.turn(ev["value"])
            return
        if kind == "turn" and cid in self.claude_knobs():   # the encoder over a Claude session widget scrolls its last reply
            if self.knob_is_live(cid) and 0 < abs(ev["value"]) <= 20:
                self.claude_scroll.turn(ev["value"])
            return
        if cid in self.settings["global_knobs"]:
            self.global_knob(cid, kind, ev["value"])
            return
        if kind == "press" and self.press_waiter and cid in self.press_waiter[1]:
            if not self.press_waiter[0].done():
                self.press_waiter[0].set_result(cid)
            return
        if kind == "press" and cid == CALIBRATE_KEY and "btn-shift" in self.pressed:
            asyncio.ensure_future(self.run_test("cal_all"))  # Shift + Setup: colour calibration test, any time
            return
        if kind == "press":
            self.pressed.add(cid)
        elif kind == "release":
            if cid in self.pressed:
                self._released[cid] = time.time()
            self.pressed.discard(cid)
        if kind == "press" and cid == R.REPEAT:
            asyncio.ensure_future(self.rerun_test())
            return
        if media_ui.handle(self, ev):  # visualizer buttons, global transport and strip seek
            self._leds_for = None
            return
        if cid == "btn-master":  # Master is the lock button: Master, then a profile button, locks that profile
            if kind == "press":
                self.master_press()
            return
        if kind == "press" and cid in R.SCENE:
            slot = R.SCENE.index(cid) + (8 if "btn-shift" in self.pressed else 0)    # Shift + a scene button: profiles 9 to 16
            target = self.at_slot(slot)
            if target:
                pid = target["id"]
                if self.armed():  # Master was pressed first: lock this profile
                    self.lock_armed_until = 0
                    self._armed_pub = False
                    self.pinned, self.override = pid, None
                elif self.pinned == pid:  # pressing the locked profile's button again unlocks
                    self.pinned = None
                elif self.pinned in self.profiles:  # the Push is locked: the lock moves to the chosen profile
                    self.pinned = pid
                else:  # Auto: just switch, and let the next app change take over again
                    self.override, self.override_front = pid, self.front
                self._leds_for = None
                self.broadcast({"type": "active", **self.active_info()})  # the UI follows the device
            return
        prof = self.active()
        wctl = self.live_buttons(prof).get(cid) if cid.startswith(("btn-upper-", "btn-lower-")) else None   # a widget's button replaces the profile's shortcut
        if wctl:
            if kind == "press" and not wctl.get("dim"):
                self.fire(cid, wctl)
            self._leds_for = None
            return
        pcid = None if cid in media_ui.owned(media_ui.player_def(self, prof)) else cid   # the buttons under the player belong to it
        ctl = self.controls_for(prof).get(pcid) if pcid else None
        if kind == "press" and ctl and ctl.get("action"):
            self.fire(cid, ctl)
        elif kind == "release" and ctl and ctl.get("action"):
            try:
                actions.release(ctl["action"])
            except Exception as exc:  # noqa: BLE001
                self.flash(f"Action failed: {exc}", ok=False)
        self._leds_for = None

    def timer_knobs(self):
        prof = self.active()
        return {f"knob-{d['col'] + 1}" for d in layout.arrangement(self.settings, prof) if d.get("type") == "clock" and d.get("w") == 2}

    def claude_knobs(self):
        prof = self.active()
        return {f"knob-{d['col'] + 1}" for d in layout.arrangement(self.settings, prof) if d.get("type") == "claude_session" and layout.available(prof, d)}

    MAX_FAVS = 27

    @staticmethod
    def fav_cap(width):
        """How many favourites one page of the browser widget holds: 5 in the 4-wide one, 9 in the 6-wide one."""
        return 9 if width >= 6 else 5 if width >= 4 else 2

    def fav_page_of(self, cap):
        n = len(self.settings.get("tab_favs") or [])
        pages = max(1, -(-n // cap))
        return self.fav_page % pages, pages

    def browser_buttons(self, width=4):
        """The browser widget's buttons. Upper row: Reload, Favourite, Page (only when there is more than one page), then the favourites that do not fit
        the lower row; lower row: the first favourites of the page. 4-wide: 4 below and 1 above (5 a page); 6-wide: 6 below and 3 above (9 a page).
        A tile sits in the display column of its button."""
        favs = self.settings.get("tab_favs") or []
        cap = self.fav_cap(width)
        page, pages = self.fav_page_of(cap) if width >= 4 else (0, 1)      # squeezed to 2 columns: just the first two favourites
        url = (self.tab or {}).get("url")
        on = bool(url) and any(f["url"] == url for f in favs)

        def slot(i):
            k = page * cap + i
            if k >= len(favs):
                return {}
            return {"label": "", "color": layout.FAV_COLORS[i % 9], "action": {"type": "browser", "op": "open", "i": k}}      # no label: the tile drawn over the button says what it is

        up = [{"label": "Reload", "icon": "redo", "action": {"type": "browser", "op": "reload"}},
              {"label": "Favourite", "icon": "starfill" if on else "star", "action": {"type": "browser", "op": "fav"}},
              {"label": f"Page {page + 1}/{pages}", "icon": "grid", "action": {"type": "browser", "op": "page", "cap": cap}} if pages > 1 else {}]
        if width < 4:
            return {"up": up[:2], "down": [slot(0), slot(1)]}
        if width >= 6:
            return {"up": up + [slot(6), slot(7), slot(8)], "down": [slot(i) for i in range(6)]}
        return {"up": up + [slot(4)], "down": [slot(i) for i in range(4)]}

    def pop(self, kind):
        self.fav_pop = {"kind": kind, "t": time.time()}

    async def browser_op(self, act):
        bundle = self._last_browser or "com.google.Chrome"
        op, favs = act.get("op"), self.settings.setdefault("tab_favs", [])
        try:
            if op == "reload":
                await tabs.reload(bundle)
            elif op == "fav":
                tab = self.tab or {}
                if not tab.get("url"):
                    return
                if any(f["url"] == tab["url"] for f in favs):
                    favs[:] = [f for f in favs if f["url"] != tab["url"]]
                    self.pop("removed")
                elif len(favs) >= self.MAX_FAVS:
                    self.pop("full")
                else:
                    favs.append({"url": tab["url"], "title": tab.get("title", ""), "host": tab.get("host", "")})
                    self.pop("added")
                settings.save(self.settings)
                self._leds_for = None
            elif op == "page":
                _, pages = self.fav_page_of(act.get("cap", 5))
                self.fav_page = (self.fav_page + 1) % pages
                self._leds_for = None
            elif op == "open" and act.get("i", 99) < len(favs):
                await tabs.open_url(bundle, favs[act["i"]]["url"])
        except Exception:  # noqa: BLE001
            self.pop("error")

    def clock_buttons(self, tall=False):
        """The clock widget's buttons: its edge pair, and under a 2 x 2 clock the pair for the other modes."""
        return {"edge": self.timer.buttons(self, tall), "down": self.timer.lower_buttons()} if tall else {"edge": self.timer.buttons(self)}

    def fire(self, cid, ctl):
        if (ctl.get("action") or {}).get("type") == "claude":   # the Claude session widget's follow button: busy -> front -> latest
            from . import claude_sessions
            cur = self.settings.get("claude_follow", "busy")
            self.settings["claude_follow"] = claude_sessions.FOLLOW[(claude_sessions.FOLLOW.index(cur) + 1) % 3 if cur in claude_sessions.FOLLOW else 0]
            settings.save(self.settings)
            self._leds_for = None
            return
        if (ctl.get("action") or {}).get("type") == "ask":   # the question card: take over the display
            self.asks.open()
            return
        if (ctl.get("action") or {}).get("type") == "browser":   # the browser widget: reload, favourite, open a saved tab
            asyncio.ensure_future(self.browser_op(ctl["action"]))
            return
        if (ctl.get("action") or {}).get("type") == "clock":   # the 2 x 1 clock's buttons: 12 / 24 hour and the timer
            self.timer.op(self, ctl["action"]["op"])
            return
        if ctl.get("risky"):
            now = time.time()
            if now - self.pending_confirm.get(cid, 0) > CONFIRM_WINDOW:
                self.pending_confirm[cid] = now
                self.flash(f"Press again to confirm: {ctl.get('label', cid)}", ok=None)
                return
            self.pending_confirm.pop(cid, None)
        if (ctl["action"] or {}).get("type") == "pin":   # make this profile Master (stays on whatever app is in front), or let go
            prof = self.active()
            if prof:
                if self.pinned == prof["id"]:
                    self.pinned = None
                else:
                    self.pinned, self.override = prof["id"], None
                self._leds_for = None
                self.broadcast({"type": "active", **self.active_info()})
            return
        try:
            actions.run(ctl["action"])
        except Exception as exc:  # noqa: BLE001
            self.flash(f"Action failed: {exc}", ok=False)

    def flash(self, text, ok=None, sub="", seconds=2.0):
        theme = (self.active() or {}).get("theme", profiles.DEFAULT_THEME)
        self.overlay = (None, time.time() + seconds, (text, ok, sub))

    async def wait_press(self, allowed, timeout=120):
        """Used by interactive tests: resolve with the first press among `allowed` control ids (None on timeout)."""
        fut = self.loop.create_future()
        self.press_waiter = (fut, set(allowed))
        try:
            return await asyncio.wait_for(fut, timeout)
        except asyncio.TimeoutError:
            return None
        finally:
            self.press_waiter = None

    def set_calibration(self, **kw):
        cal = {**self.settings.get("calibration", {}), **kw}
        self.settings["calibration"] = cal
        settings.save(self.settings)
        color.set_calibration(cal)
        self.broadcast({"type": "settings", "settings": self.settings})

    # ---------- tests ----------
    async def run_test(self, name, **kw):
        if self.test_running:
            return
        self.test_running = True
        self.repeat_color = (255, 255, 255)
        self.broadcast({"type": "test", "state": "running", "name": name})
        ok, summary = await self.runner.run(self, name, **kw)
        self.test_running = False
        self._leds_for = None
        self.repeat_color = (60, 220, 120) if ok else (255, 60, 60)
        self.push.clear_leds()
        self.push.set_led(R.REPEAT, self.repeat_color)
        self.flash(("PASS: " if ok else "FAIL: ") + name, ok=ok, sub=summary, seconds=6)
        self.broadcast({"type": "test", "state": "done", "name": name, "ok": ok, "summary": summary})
        print(f"[test {name}] {'PASS' if ok else 'FAIL'}: {summary}")

    async def rerun_test(self):
        if not self.runner.last:
            self.flash("No test has run yet", ok=False)
            return
        name, kw = self.runner.last
        await self.run_test(name, **kw)

    # ---------- sleep ----------
    def sleep(self):
        self.asleep = True
        self.push.display_on = False
        self.push.clear_leds()
        self.push.set_led(WAKE_INDICATOR, (40, 40, 40))
        self._leds_for = None

    def wake(self):
        self.asleep = False
        self.push.display_on = True
        self.push.clear_leds()
        self._leds_for = None

    # ---------- rendering ----------
    def controls_for(self, prof):
        """The controls that act right now: the profile's own, plus the global pad column shared by every profile."""
        own = {k: v for k, v in ((prof or {}).get("controls") or {}).items() if (v.get("action") or {}).get("type") != "pin"}   # Master lives on the profile widget now
        return {**own, **(self.settings.get("global_pads") or {})}

    def live_buttons(self, prof):
        """The display buttons the widgets on screen right now bring along ({button id: control}); none while a list is open in Browse."""
        if (self.media_ui or {}).get("browse"):
            return {}
        return layout.widget_buttons(self, prof, layout.arrangement(self.settings, prof))

    def zones_for(self, prof):
        """What every display button shows: the profile's shortcuts, then the buttons the widgets bring along on top of them."""
        return {**self.labels(prof), **self.button_zones(self.live_buttons(prof))}

    @staticmethod
    def button_zones(ctls):
        return {cid: {"label": c["label"], "icon": c.get("icon"), "keep_case": False, **({"bar": True} if c.get("bar") else {}), **({"dim": True} if c.get("dim") else {})}
                for cid, c in ctls.items()}

    def preview_scene(self, pid):
        """The home screen a profile would show on the Push, for the UI's display when you view a profile that isn't live."""
        prof = self.profiles.get(pid)
        if not prof:
            return {"type": "scene_preview", "id": pid, "scene": None}
        arr = layout.arrangement(self.settings, prof)
        zones = {**self.labels(prof, arr), **self.button_zones(layout.widget_buttons(self, prof, arr, True))}
        spec = layout.spec(self, prof, "Master" if self.pinned == pid else "Auto", zones, frozenset(), live=False)
        return {"type": "scene_preview", "id": pid, "scene": {"kind": "profile", "spec": spec}}

    def preview_layout(self, pid, widgets):
        """The widgets the layout editor is arranging, drawn as the display would (the editor paints the player itself, with a made-up track)."""
        prof = self.profiles.get(pid)
        mode = "Master" if self.pinned == pid else "Auto"
        arr = widgets if widgets is not None else layout.arrangement(self.settings, prof)
        zones = {**self.labels(prof, arr), **self.button_zones(layout.widget_buttons(self, prof, arr, True))} if prof else {}
        spec = {**layout.spec(self, prof, mode, zones, frozenset()), "widgets": layout.materialize(self, prof, mode, arr, False)}
        return {"type": "layout_preview", "id": pid, "scene": {"kind": "profile", "spec": spec}}

    def labels(self, prof, widgets=None):
        """The profile's own labels for the display buttons. The buttons under the player (in `widgets`, else the live layout) are left empty."""
        out = {}
        taken = media_ui.owned(media_ui.player_in(widgets) if widgets is not None else media_ui.player_def(self, prof))
        for cid in R.UPPER + R.LOWER:
            c = (prof or {}).get("controls", {}).get(cid) or {}
            if (c.get("action") or {}).get("type") == "pin" or cid in taken:
                c = {}   # Master lives on the profile widget now; a player's buttons are its own
            out[cid] = {"label": c.get("label", ""), "icon": c.get("icon"), "keep_case": bool(c.get("keep_case"))}
        return out

    def apply_leds(self, prof):
        if self.asks.on:
            key = ("ask", self.asks.mode, self.asks.qi, self.asks.hi, tuple(sorted((k, tuple(v["sel"])) for k, v in self.asks.ans.items())))
            if key == self._leds_for or not self.push.connected:
                return
            self._leds_for = key
            self.push.clear_leds()
            for cid, rgb in self.asks.leds().items():
                self.push.set_led(cid, rgb)
            return
        blink = int(time.time() * 2) % 2 if self.armed() else -1
        key = (prof["id"] if prof else None, self.pinned, tuple(sorted(self.pressed)), self.test_running,
               self.repeat_color, blink, int(time.time() * 2) % 2 if self.asks.waiting() else -1, media_ui.led_signature(self), self.front, self.timer.state, self.timer.kind, int(time.time() * 2) % 2 if self.timer.state == "done" else -1)
        if key == self._leds_for or not self.push.connected:
            return
        self._leds_for = key
        scale = 1.0  # brightness is applied by the hardware (SysEx 06)
        self.push.clear_leds()
        taken = media_ui.owned(media_ui.player_def(self, prof))   # the buttons under the player are lit by the player
        for cid, ctl in self.controls_for(prof).items():
            if cid in taken:
                continue
            if ctl.get("color"):
                rgb = profiles.hex_rgb(ctl["color"])
                if cid in self.pressed and ctl.get("states", {}).get("active"):
                    rgb = profiles.hex_rgb(ctl["states"]["active"])
                self.push.set_led(cid, tuple(int(c * scale) for c in rgb))
        for cid, c in self.live_buttons(prof).items():   # buttons the widgets bring along replace the profile's own on those places
            rgb = profiles.hex_rgb(c["color"]) if c.get("color") else (0, 0, 0)
            k = 0.25 if c.get("dim") or (c.get("pulse") and int(time.time() * 2) % 2) else 1.0
            self.push.set_led(cid, tuple(int(v * k * scale) for v in rgb))
        layer = 8 if "btn-shift" in self.pressed else 0   # holding Shift shows the second layer of profiles on the same eight buttons
        for p in self.profiles.values():  # scene buttons = profile slots
            i = p.get("slot", -1) - layer
            if 0 <= i < 8:
                rgb = profiles.hex_rgb(p["theme"]["accent"])
                k = 1.0 if p["id"] == (prof or {}).get("id") else 0.25
                self.push.set_led(R.SCENE[i], tuple(int(c * k * scale) for c in rgb))
        lit = self.pinned in self.profiles or blink == 1  # Master: lit while a profile is locked, blinks while waiting for one
        self.push.set_led("btn-master", (255, 255, 255) if lit else (45, 45, 45))
        for cid, rgb in media_ui.leds(self).items():  # the visualizer's buttons (and its mode button) in every profile
            self.push.set_led(cid, rgb)
        self.push.set_led(R.REPEAT, self.repeat_color)  # always lit: the user cannot see unlit buttons
        self.push.set_led(CALIBRATE_KEY, (70, 70, 70))  # reserved global: Shift + Setup = calibration test

    async def _poll_tab(self):
        self._tab_busy = True
        try:
            self.tab = await tabs.active_tab(self._last_browser or "com.google.Chrome")
        finally:
            self._tab_busy = False

    def publish_scene(self, kind, spec):
        """Remember the scene and send its spec to browsers that mirror by re-rendering."""
        self.scene = {"kind": kind, "spec": spec}
        j = json.dumps(self.scene, sort_keys=True)
        if j != self._scene_json:
            self._scene_json = j
            for ws, mode in list(self.mirror.items()):
                if mode == "render":
                    asyncio.ensure_future(self._send(ws, {"type": "scene", "scene": self.scene}))

    def current_toast(self):
        h = self.hud if self.hud and time.time() < self.hud["until"] else None
        return {k: v for k, v in h.items() if k not in ("until", "which")} if h else None

    def _pill_spec(self, now):
        """The one overlay for every short message: a knob's value (with its bar) or a note. Fades in and out."""
        h = self.hud if self.hud and now < self.hud["until"] else None
        n = None   # short confirmations ("Saved", "Master: ...") are not shown: they only changed what the user already sees on the buttons
        if not (h or n):
            self._pill_since = None
            return None
        if self._pill_since is None:
            self._pill_since = now
        until = (h or n)["until"]
        a = round(max(0.0, min(1.0, (now - self._pill_since) / 0.12, (until - now) / 0.18)) * 8) / 8
        if h:
            return {"text": h["label"], "icon": h["icon"], "value": h["value"], "vtext": h["text"], "a": a}
        return {"text": n["text"], "icon": n["icon"], "a": a}

    def _glow(self, now):
        """Strength 0..1 of the light under each button strip: full while held, fading over 0.25 s after release."""
        out = {c: 1.0 for c in self.pressed if c.startswith("btn-")}
        for c, t in list(self._released.items()):
            k = 1 - (now - t) / 0.25
            if k <= 0:
                del self._released[c]
            elif c not in out:
                out[c] = round(k * 4) / 4
        return out

    def show(self, kind, spec):
        now = time.time()
        spec = {**spec, "toast": None}
        pl = self._pill_spec(now)
        if pl:
            spec["pill"] = pl
        g = self._glow(now)
        if g:
            spec["glow"] = g
        img = render.draw(spec)
        self._fps = render._fps(spec, now)
        view = f"{kind}|{spec.get('view', '')}"
        if self._view and view != self._view and "message" not in (kind, self._view.split("|")[0]):
            sl = self.slide_next if self.slide_next and now - self.slide_next[2] < 1.0 else None
            self.slide_next = None
            self._trans = (self.push.frame, now, sl)   # a change of view arrives with a short wipe (or the player sliding), not a cut
        self._view = view
        if self._trans:
            sl = self._trans[2]
            p = (now - self._trans[1]) / (0.42 if sl and sl[1] else 0.3 if sl else 0.32)
            if p >= 1:
                self._trans = None
            elif sl:
                img = render.slide(self._trans[0], img, p, sl[0], sl[1])
            else:
                img = render.wipe(self._trans[0], img, p)
        self.push.set_frame(img)
        self.publish_scene(kind, spec)

    def render(self):
        if self.test_running:
            self.publish_scene("test", library.test_rainbow())  # the test draws its own frames on the Push
            return
        if self.overlay and time.time() < self.overlay[1]:
            text, ok, sub = self.overlay[2]
            self.show("message", library.message(text, ok, sub))
            self.apply_leds(self.active())  # the lights keep up while a message is on the screen
            return
        self.asks.sync()
        self.asks.alert_tick()
        self.limits.tick()
        if not self.asks.on and self.limits.active():
            self.show("limit", self.limits.scene())
            return
        if self.asks.fullscreen():
            self.show("ask_alert", self.asks.alert_scene())
            return
        if self.asks.on:
            self.show("ask", self.asks.scene())
            self.apply_leds(self.active())
            return
        prof = self.active()
        toast = self.current_toast()
        zones = self.labels(prof)
        active = frozenset(self.pressed)
        mode = ""
        if prof:
            if self.pinned == prof["id"]:
                mode = "Master"
            elif self.front in prof.get("match", {}).get("bundle_ids", []):
                mode = "Auto"
            else:
                mode = "Auto · kept from last app"
        media_ui.auto_show(self, prof)
        spec = media_ui.scene(self, prof, mode, toast)
        if spec:
            self.show("media", spec)
        elif prof:
            self.show("profile", layout.spec(self, prof, mode, self.zones_for(prof), active, "full", toast))
        else:
            self.show("idle", layout.spec(self, None, "", zones, active, "full", toast))
        self.apply_leds(prof)

    # ---------- loops ----------
    async def tick(self):
        last_front = last_stream = last_standby_refresh = last_live = last_tab = last_dl = 0.0
        while True:
            now = time.time()
            self.timer.tick(self)
            if self._armed_pub != self.armed():  # the 5 s window ran out
                self._armed_pub = self.armed()
                self._leds_for = None
                self.broadcast({"type": "active", **self.active_info()})
            if now - self._vol_read_at > 5:  # pick up volume changes made elsewhere (keyboard, menu bar)
                self._vol_read_at = now
                self.volume_ctl.request_read()
            if now - last_front > 0.5:
                last_front = now
                fb = frontmost.bundle_id()
                if fb in tabs.BROWSERS:
                    self._last_browser = fb
                if fb and fb != self.front:
                    self.front = fb
                    self._leds_for = None
                    self.broadcast({"type": "active", **self.active_info()})
            if now < self.want_dl_until and now - last_dl > 1.0:
                last_dl = now
                self.dl.poll()
            if now < self.want_tab_until and now - last_tab > 1.2 and not self._tab_busy:
                last_tab = now
                asyncio.ensure_future(self._poll_tab())
            if self._settings_pending and now - last_live > 0.1:
                self._settings_pending = False
                last_live = now
                self.broadcast({"type": "settings", "settings": self.settings})
            if self._settings_dirty and not (self.hud and now < self.hud["until"]):
                self._settings_dirty = False
                settings.save(self.settings)
                self.broadcast({"type": "settings", "settings": self.settings})
            idle_s = self.settings["idle_minutes"] * 60
            if not self.asleep and not self.standby and idle_s and now - self.last_input > idle_s and not self.test_running:
                self.sleep()
            if self.standby:
                if self.push.connected and self.scene.get("kind") != "standby":
                    self.show_standby()
                elif self.push.connected and now - last_standby_refresh > 5:
                    last_standby_refresh = now  # keep LEDs off even if something re-lit them
                    self.push.clear_leds(force=True)
            elif not self.asleep and self.push.connected:
                self.render()
                self.asks.paint_pads()
                if not self.asks.alerting:
                    self.limits.paint_pads()
                if not (self.asks.alerting or self.limits.alerting):
                    self.timer.paint_pads(self)
            elif self.asleep:
                self.publish_scene("asleep", {"accent": "#000000", "zones": {}, "active": [], "widgets": [], "no_zones": True, "toast": None})
            if now - last_stream > 0.125 and any(m == "stream" for m in self.mirror.values()):
                last_stream = now
                buf = io.BytesIO()
                self.push.frame.convert("RGB").save(buf, "JPEG", quality=72)
                data = buf.getvalue() if not self.asleep else b""
                for ws, mode in list(self.mirror.items()):
                    if mode == "stream" and data:
                        asyncio.ensure_future(self._send_bytes(ws, data))
            await asyncio.sleep(1 / 30 if (self.media_ui or self._trans or self._released or self._fps >= 15 or self.asks.alerting or self.limits.alerting) else 1 / 20)

    def armed(self):
        return time.time() < self.lock_armed_until

    def master_press(self):
        """Master arms the lock for 5 s (a profile button then locks it). Pressed again it cancels, or unlocks if locked."""
        if self.armed():
            self.lock_armed_until = 0
            self.overlay = None
        elif self.pinned in self.profiles:
            self.pinned, self.override = None, None
        else:
            self.lock_armed_until = time.time() + 5
            self.flash("Press a profile to make it master", ok=None, seconds=5)
        self._leds_for = None
        self._armed_pub = self.armed()
        self.broadcast({"type": "active", **self.active_info()})

    def active_info(self):
        a = self.active()
        return {"active": a["id"] if a else None, "pinned": self.pinned, "front": self.front, "armed": self.armed()}

    # ---------- UI link ----------
    def broadcast(self, msg):
        for ws in list(self.clients):
            asyncio.ensure_future(self._send(ws, msg))

    async def _send(self, ws, msg):
        try:
            await ws.send_json(msg)
        except Exception:  # noqa: BLE001
            self.clients.discard(ws)

    async def _send_bytes(self, ws, data):
        try:
            await ws.send_bytes(data)
        except Exception:  # noqa: BLE001
            self.clients.discard(ws)

    def _media_changed(self):
        self._leds_for = None
        self.broadcast({"type": "media", "media": self.media.snapshot()})

    def hello(self):
        icons = json.loads((Path(__file__).parent / "icons.json").read_text())
        return {"type": "hello", "icons": icons, "controls": R.CONTROLS, "profiles": list(self.ordered()),
                "tests": TESTS_META, "volume": self.volume, "media": self.media.snapshot(), "settings": self.settings, "status": self.status, "asleep": self.asleep, "standby": self.standby,
                **self.active_info()}

    async def handle(self, msg):
        t = msg.get("type")
        if t == "preview":
            self.preview = bool(msg["on"])
        elif t == "set_profile":
            self.pinned = msg.get("id")
            self.override = None
            self._leds_for = None
            self.broadcast({"type": "active", **self.active_info()})
        elif t == "save_profile":
            prof = msg["profile"]
            old = self.profiles.get(prof.get("id"))
            if old and isinstance(old.get("slot"), int):
                prof = {**prof, "slot": old["slot"]}          # the scene slot is only changed by set_slot (Edit layout): a stale copy must not undo a move
            else:
                prof = {k: v for k, v in prof.items() if k != "slot"}
                free = profiles.next_free_slot(self.profiles)
                if free is not None:
                    prof["slot"] = free                         # a new profile takes the next free scene button
            profiles.save(prof)
            self.profiles = profiles.load_all()
            self.fix_slots()
            self._leds_for = None
            self.broadcast({"type": "profiles", "profiles": self.ordered()})
        elif t == "set_slot":      # Edit layout: move a profile to a scene button; if another profile is there the two swap
            me = self.profiles.get(msg.get("id"))
            slot = msg.get("slot")
            if me and isinstance(slot, int) and 0 <= slot < profiles.SLOTS:
                other = self.at_slot(slot)
                mine = me.get("slot")
                me["slot"] = slot
                profiles.save(me)
                if other and other is not me:
                    if isinstance(mine, int):
                        other["slot"] = mine
                    else:
                        other.pop("slot", None)
                    profiles.save(other)
                self.fix_slots()
                self._leds_for = None
                self.broadcast({"type": "profiles", "profiles": self.ordered()})
        elif t == "delete_profile":
            profiles.delete(msg["id"])
            self.profiles = profiles.load_all()
            if self.pinned == msg["id"]:
                self.pinned = None
            self._leds_for = None
            self.broadcast({"type": "profiles", "profiles": self.ordered()})
            self.broadcast({"type": "active", **self.active_info()})
        elif t == "set_setting":
            self.settings[msg["key"]] = msg["value"]
            settings.save(self.settings)
            if msg["key"] == "global_pads":
                self._leds_for = None
            if msg["key"] == "calibration":
                color.set_calibration(msg["value"])
            if msg["key"] == "claude_usage_live":
                usage.LIVE["claude"] = bool(msg["value"])
                usage._live["at"] = 0.0
            self.apply_hardware()
            self.broadcast({"type": "settings", "settings": self.settings})
        elif t == "permissions":  # the first-run setup asks while it is open
            self.broadcast({"type": "permissions", "accessibility": permissions.accessibility(), "automation": permissions.automation()})
        elif t == "audio_check":  # the setup's System audio row: run the audio helper for a while so it can report whether macOS lets it listen
            self.media.want_viz_until = time.time() + 25
        elif t == "open_privacy":  # open one System Settings > Privacy page (only the names in permissions.PANES)
            permissions.open_pane(msg.get("pane"))
        elif t == "reset_settings":  # everything back to defaults except the colour calibration and the on/off state
            keep = {k: self.settings[k] for k in ("calibration", "standby", "onboarded") if k in self.settings}
            self.settings = {**json.loads(json.dumps(settings.DEFAULTS)), **keep}
            settings.save(self.settings)
            self.apply_hardware()
            self.broadcast({"type": "settings", "settings": self.settings})
        elif t == "media_cmd":  # a click in the UI: the same actions as the buttons on the Push
            op = msg["op"]
            if op == "mode":
                media_ui.cycle_mode(self)
            else:
                m = await self.media.command(op, msg.get("arg"))
                if m:
                    self.flash(m, ok=None, seconds=1.8)
        elif t == "media_config":  # visualizer settings from the UI (merged into settings.media)
            media_ui.set_cfg(self, **msg["config"])
            if media_ui.cfg(self)["audio"]:
                self.media.need_audio()
            else:
                self.media.audio.stop()
        elif t == "spotify":
            sp = self.media.spotify
            if msg["op"] == "client_id":
                sp.set_client_id(msg.get("value", ""))
            elif msg["op"] == "disconnect":
                sp.disconnect()
            self.media._publish(True)
        elif t == "run_test":
            asyncio.ensure_future(self.run_test(msg["name"]))
        elif t == "standby":
            await self.set_standby(bool(msg["on"]))
        elif t == "input":  # synthetic hardware-style event (UI knob scroll, tests); "echo" also reaches the UI like a real one
            (self.on_event if msg.get("echo") else self.dispatch)(msg["event"])
        elif t == "press":  # a click in the replica UI
            self.dispatch({"control": msg["control"], "kind": "press", "value": 127})
            self.dispatch({"control": msg["control"], "kind": "release", "value": 0})

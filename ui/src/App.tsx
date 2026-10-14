import { isGlobalPad } from "./model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppCtx, type App as AppModel, type SaveState, type SettingsPage } from "./ctx";
import { useDaemon, type Ctl, type Profile } from "./daemon";
import RightColumn from "./RightColumn";
import { LayoutProvider } from "./layoutCtx";
import Intro from "./Intro";
import Splash from "./Splash";
import Onboarding from "./Onboarding";
import Tour from "./Tour";
import ImportDialog from "./ImportDialog";
import ExportDialog from "./ExportDialog";
import Backdrop, { pulseAt, type FxMode, type Look, type Tone } from "./Backdrop";
import Palette from "./Palette";
import ProfileRail from "./ProfileRail";
import SettingsSheet from "./SettingsSheet";
import Stage from "./Stage";
import TopBar from "./TopBar";
import { useAppMotion } from "./motion";
import { Toaster, useDialog, useToast } from "./ui";

function Shell() {
  const d = useDaemon();
  const toast = useToast();
  const [currentId, setCurrentId] = useState<string>("");
  const [draft, setDraft] = useState<Profile | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const hist = useRef<Record<string, { stack: Profile[]; at: number }>>({}), baseline = useRef<Record<string, Profile>>({});
  const [, bump] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [listen, setListen] = useState(true); // follow the Push by default
  const [page, setPage] = useState<SettingsPage>("general");
  const settings = useDialog(), palette = useDialog();
  const stored = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const [look, setLookState] = useState<Look>(() => stored("push-ui-look", "showpiece") as Look);
  const [fx, setFxState] = useState<FxMode>(() => stored("push-ui-fx", "ambient") as FxMode);
  const setLook = useCallback((l: Look) => { setLookState(l); try { localStorage.setItem("push-ui-look", l); } catch { /* private mode */ } }, []);
  const setFx = useCallback((m: FxMode) => { setFxState(m); try { localStorage.setItem("push-ui-fx", m); } catch { /* private mode */ } }, []);
  const [tone, setToneState] = useState<Tone>(() => (stored("push-ui-tone", "warm") === "graphite" ? "graphite" : "warm"));
  const [sceneHl, setSceneHl] = useState<number | null>(null); // a scene button to point out on the replica
  const setTone = useCallback((t: Tone) => { setToneState(t); try { localStorage.setItem("push-ui-tone", t); } catch { /* private mode */ } }, []);
  useEffect(() => { const r = document.documentElement; r.dataset.look = look; r.dataset.fx = fx; r.dataset.tone = tone; }, [look, fx, tone]);

  const serverProfile = d.profiles.find((p) => p.id === currentId) ?? d.profiles.find((p) => p.id === d.active.active) ?? d.profiles[0];
  const profile = draft && draft.id === serverProfile?.id ? draft : serverProfile;

  // autosave: debounce edits, then send the whole profile
  useEffect(() => {
    if (!draft) return;
    setSaveState("saving");
    const t = window.setTimeout(() => d.send({ type: "save_profile", profile: draft }), 600);
    return () => clearTimeout(t);
  }, [draft]); // eslint-disable-line
  useEffect(() => { // the daemon echoed our save
    if (draft && serverProfile && draft.id === serverProfile.id && JSON.stringify(draft) === JSON.stringify(serverProfile)) { setDraft(null); setSaveState("saved"); setSavedAt(Date.now()); }
  }, [d.profiles]); // eslint-disable-line

  // Picking a profile to edit holds the editor on it (the Push keeps following your apps). followPush() lets the editor track the live profile again.
  const [held, setHeld] = useState(false); const heldRef = useRef(false); heldRef.current = held;
  const showProfile = useCallback((id: string) => { if (draft) d.send({ type: "save_profile", profile: draft }); setCurrentId(id); setSelected(null); }, [draft, d]);
  const setCurrent = useCallback((id: string) => { showProfile(id); setHeld(true); }, [showProfile]);
  const followPush = useCallback(() => { setHeld(false); if (d.active.active) showProfile(d.active.active); }, [showProfile, d.active.active]);
  // Every edit goes through here: it remembers the previous version (a burst of keystrokes counts as one step) so Undo and Revert work.
  const commit = useCallback((next: Profile) => {
    if (profile) {
      const h = (hist.current[profile.id] ??= { stack: [], at: 0 }), now = Date.now();
      if (now - h.at > 900) { h.stack.push(profile); if (h.stack.length > 60) h.stack.shift(); }
      h.at = now;
    }
    setDraft(next); bump((n) => n + 1);
  }, [profile]);
  const updateProfile = useCallback((patch: Partial<Profile>) => { if (profile) commit({ ...profile, ...patch }); }, [profile, commit]);
  const gp = d.settings?.global_pads;
  // The right-hand pad column is shared by every profile: it is stored in the settings, not in the profile.
  const sendGlobal = useCallback((next: Record<string, Ctl>) => d.send({ type: "set_setting", key: "global_pads", value: next }), [d]);
  const updateControl = useCallback((id: string, c: Ctl | null) => {
    if (isGlobalPad(id)) { const next = { ...(gp ?? {}) }; if (c === null) delete next[id]; else next[id] = c; sendGlobal(next); return; }
    if (!profile) return;
    const controls = { ...profile.controls }; if (c === null) delete controls[id]; else controls[id] = c;
    commit({ ...profile, controls });
  }, [profile, commit, gp, sendGlobal]);
  const swapControls = useCallback((x: string, y: string) => {
    if (!profile) return;
    const controls = { ...profile.controls }, shared = { ...(gp ?? {}) };
    const get = (id: string) => (isGlobalPad(id) ? shared[id] : controls[id]);
    const put = (id: string, c?: Ctl) => { const t = isGlobalPad(id) ? shared : controls; if (c) t[id] = c; else delete t[id]; };
    const cx = get(x), cy = get(y); put(x, cy); put(y, cx); // dragging a pad into the global column makes it global, and back
    if (!isGlobalPad(x) || !isGlobalPad(y)) commit({ ...profile, controls });
    if (isGlobalPad(x) || isGlobalPad(y)) sendGlobal(shared);
  }, [profile, commit, gp, sendGlobal]);
  useEffect(() => { for (const p of d.profiles) baseline.current[p.id] ??= structuredClone(p); }, [d.profiles]);
  const undo = useCallback(() => {
    const h = profile && hist.current[profile.id], prev = h?.stack.pop();
    if (!prev) return; h!.at = 0; setDraft(prev); bump((n) => n + 1);
  }, [profile]);
  const base = profile ? baseline.current[profile.id] : undefined;
  const canUndo = !!profile && (hist.current[profile.id]?.stack.length ?? 0) > 0;
  const canRevert = !!profile && !!base && JSON.stringify({ ...base, slot: 0 }) !== JSON.stringify({ ...profile, slot: 0 });
  const revert = useCallback(() => { if (!profile || !base) return; hist.current[profile.id] = { stack: [], at: 0 }; setDraft({ ...structuredClone(base), ...(profile.slot !== undefined ? { slot: profile.slot } : {}) }); bump((n) => n + 1); toast("Back to how this profile was when you opened the app", "good"); }, [profile, base, toast]);
  useEffect(() => { // ⌘Z undoes the last profile edit, except while typing in a field (which has its own undo)
    const k = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !t?.closest("input,textarea,select,[contenteditable]")) { e.preventDefault(); undo(); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [undo]);
  const nudgeKnob = useCallback((id: string, dir: number) => {
    if (!d.settings?.global_knobs?.[id]) return;
    for (const ev of [{ kind: "touch", value: 1 }, { kind: "turn", value: dir }, { kind: "untouch", value: 0 }]) d.send({ type: "input", event: { control: id, ...ev } });
  }, [d]);

  useEffect(() => { d.send({ type: "preview", on: listen }); }, [listen, d.connected]); // eslint-disable-line
  useEffect(() => { if (selected && window.innerWidth <= 1180) document.querySelector(".inspector")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [selected]);
  // the Push moved to another profile (scene button, frontmost app, pin): the view follows
  const seenLive = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const a = d.active.active;
    if (!a || seenLive.current === a) return;
    seenLive.current = a;
    if (!heldRef.current) showProfile(a);
  }, [d.active.active]); // eslint-disable-line
  // feedback
  useEffect(() => { if (d.error) { toast(d.error, "bad"); d.clearError(); } }, [d.error]); // eslint-disable-line
  const prevTest = useRef(d.test.state);
  useEffect(() => {
    if (prevTest.current === "running" && d.test.state === "done") toast(`${d.test.ok ? "Passed" : "Failed"}: ${d.test.summary}`, d.test.ok ? "good" : "bad");
    prevTest.current = d.test.state;
  }, [d.test.state]); // eslint-disable-line
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); palette.open ? palette.close() : palette.show(); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [palette]);

  useAppMotion(profile?.id, selected, false);
  // a profile change sends a wash of its colour out from the device
  useEffect(() => { if (profile) window.setTimeout(() => pulseAt(document.querySelector(".stagecol .replica"), profile.theme.accent, 1.3), 80); }, [profile?.id]); // eslint-disable-line
  const view = useMemo(() => (profile ? { ...profile, controls: { ...profile.controls, ...(gp ?? {}) } } : profile), [profile, gp]);
  const model = useMemo<AppModel>(() => ({
    d, profile: view, setCurrent, selected, setSelected, updateControl, swapControls, updateProfile, saveState, held, followPush, savedAt, undo, canUndo, revert, canRevert, listen, setListen, nudgeKnob, look, setLook, fx, setFx, tone, setTone, sceneHl, setSceneHl,
    openSettings: (p) => { if (p) setPage(p); settings.show(); }, openPalette: palette.show,
  }), [d, view, setCurrent, selected, updateControl, swapControls, updateProfile, saveState, held, followPush, savedAt, undo, canUndo, revert, canRevert, listen, nudgeKnob, look, setLook, fx, setFx, tone, setTone, sceneHl, settings.show, palette.show]);

  return (
    <AppCtx.Provider value={model}>
      {look !== "simple" && <Backdrop look={look} mode={fx} tone={tone} accent={profile?.theme.accent ?? "#d9dde4"} />}
      <div className="app">
        <TopBar />
        <div className="bannerslot">
          {!d.connected && <div className="banner bad" role="alert">The Push daemon is not reachable. Start it with <code>./run_daemon.sh</code>; this page reconnects by itself.</div>}

        </div>
        <LayoutProvider><div className="main"><ProfileRail /><Stage /><RightColumn /></div></LayoutProvider>
      </div>
      <Intro />
      <Onboarding />
      <Tour />
      <Splash connected={d.connected} hello={!!d.settings} usb={d.status.usb} profiles={d.profiles.length} />
      <ImportDialog />
      <ExportDialog />
      <SettingsSheet dialog={settings} page={page} setPage={setPage} />
      <Palette dialog={palette} />
    </AppCtx.Provider>
  );
}

export default function App() { return <Toaster><Shell /></Toaster>; }

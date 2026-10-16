import { useCallback, useEffect, useRef, useState } from "react";
import type { Icons, Scene } from "./display/render";

export type Action = { type: string; [k: string]: unknown };
export type Ctl = { label?: string; icon?: string; keep_case?: boolean; color?: string; action?: Action; risky?: boolean; states?: { active?: string; error?: string } };
export type Profile = {
  id: string; name: string; slot?: number; match: { bundle_ids: string[] };
  theme: { accent: string; bg: string }; controls: Record<string, Ctl>;
  display?: { subtitle?: string; knobs?: boolean; player_side?: "left" | "right"; widgets?: import("./display/render").Widget[] };
  icon?: ProfileIconSpec;
  author?: { name: string; url?: string }; description?: string; created?: string;
  source?: { kind: "bundled" | "created" | "imported"; imported_at?: string; file?: string; author?: string };
};
export type ProfileIconSpec = { type: "glyph"; name: string } | { type: "app"; bundle: string } | { type: "image"; data: string };
export type Calibration = { red: number[]; green: number[]; blue: number[]; saturation: number };
export type Settings = { onboarded?: boolean; claude_usage_live?: boolean; knob_turns_full_range?: number; knob_ticks_per_turn?: number; knob_measured?: boolean; require_touch?: boolean; global_knobs?: Record<string, string>; global_pads?: Record<string, Ctl>; window_pads?: boolean; display_brightness: number; calibration?: Calibration; lifecycle: string; idle_minutes: number; brightness: number };
export type MediaTrack = { source: string; title: string; artist: string; album: string; art: string; duration: number; playing: boolean; shuffle: boolean | null; repeat: boolean | null; liked: boolean | null; caps: string[] };
export type MediaState = {
  player: string; track: MediaTrack | null; position: number; tint: string | null; tint2?: string | null;
  spotify: { client_id: string; connected: boolean; user: string; error: string };
  chrome: { state: "unknown" | "ok" | "needs_js" | "off"; message: string };
  audio: { status: "off" | "starting" | "waiting" | "ok" | "unavailable" | "error"; message: string; live: boolean; check?: "idle" | "listening" | "heard" | "silent" };
  queue: { title: string; artist: string; uri: string }[];
};
export type MediaConfig = { mode: "half" | "off"; idle: "empty" | "last"; chrome: boolean; spotify_desktop: boolean; system: boolean; auto_show: boolean };
export type Status = { usb: boolean; midi: boolean };
export type Permissions = { accessibility: boolean | null; automation: Record<string, string> | null; downloads?: boolean | null };
export type Input = { control: string; kind: string; value: number };
export type TestMeta = { title: string; group: string; interactive: boolean; description: string };
export type TestState = { state: "idle" | "running" | "done"; name?: string; ok?: boolean; summary?: string; stopped?: boolean };

export function useDaemon() {
  const [connected, setConnected] = useState(false);
  const [controls, setControls] = useState<Record<string, { kind: string; name: string }>>({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Status>({ usb: false, midi: false });
  const [active, setActive] = useState<{ active: string | null; pinned: string | null; front: string; armed?: boolean }>({ active: null, pinned: null, front: "" });
  const [test, setTest] = useState<TestState>({ state: "idle" });
  const [lastInput, setLastInput] = useState<Input | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [error, setError] = useState("");
  const [standby, setStandby] = useState(false);
  const [volume, setVolume] = useState(50);
  const [tests, setTests] = useState<Record<string, TestMeta>>({});
  const [icons, setIcons] = useState<Icons>({});
  const [scene, setScene] = useState<Scene | null>(null);
  const [media, setMedia] = useState<MediaState | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sceneAt = useRef(0);
  const [layoutPreview, setLayoutPreview] = useState<{ id: string; scene: Scene | null } | null>(null);
  const [previewScene, setPreviewScene] = useState<{ id: string; scene: Scene | null } | null>(null);
  const frameListener = useRef<((b: ArrayBuffer) => void) | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let timer: number;
    const open = () => {
      const s = new WebSocket(`ws://${location.host}/ws`);
      ws.current = s;
      s.binaryType = "arraybuffer";
      s.onopen = () => setConnected(true);
      s.onclose = () => { setConnected(false); if (!closed) timer = window.setTimeout(open, 1500); };
      s.onmessage = (e) => {
        if (typeof e.data !== "string") { frameListener.current?.(e.data as ArrayBuffer); return; }
        const m = JSON.parse(e.data);
        if (m.type === "hello") {
          setStandby(!!m.standby); setTests(m.tests ?? {}); setVolume(m.volume ?? 50); setIcons(m.icons); setControls(m.controls); setProfiles(m.profiles); setSettings(m.settings); setStatus(m.status); setMedia(m.media ?? null);
          setActive({ active: m.active, pinned: m.pinned, front: m.front, armed: !!m.armed });
        } else if (m.type === "status") setStatus(m.status);
        else if (m.type === "profiles") setProfiles(m.profiles);
        else if (m.type === "settings") setSettings(m.settings);
        else if (m.type === "active") setActive({ active: m.active, pinned: m.pinned, front: m.front, armed: !!m.armed });
        else if (m.type === "test") setTest({ state: m.state, name: m.name, ok: m.ok, summary: m.summary, stopped: m.stopped });
        else if (m.type === "input") setLastInput({ control: m.control, kind: m.kind, value: m.value });
        else if (m.type === "volume") setVolume(m.value);
        else if (m.type === "standby") setStandby(!!m.standby);
        else if (m.type === "media") setMedia(m.media);
        else if (m.type === "scene") {
          // The visualizer scene changes ~30 times a second: the display canvas reads the ref, React only hears about it a few times a second.
          sceneRef.current = m.scene;
          const now = performance.now();
          if (m.scene?.kind !== "media" || now - sceneAt.current > 300) { sceneAt.current = now; setScene(m.scene); }
        }
        else if (m.type === "layout_preview") setLayoutPreview({ id: m.id, scene: m.scene });
        else if (m.type === "scene_preview") setPreviewScene({ id: m.id, scene: m.scene });
        else if (m.type === "permissions") setPermissions({ accessibility: m.accessibility, automation: m.automation ?? null, downloads: m.downloads ?? null });
        else if (m.type === "error") setError(m.message);
      };
    };
    open();
    return () => { closed = true; clearTimeout(timer); ws.current?.close(); };
  }, []);

  const send = useCallback((msg: object) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(msg)), []);
  const forceOff = typeof location !== "undefined" && new URLSearchParams(location.search).has("nopush"); // ?nopush previews the "Push not connected" state
  return { connected, controls, profiles, settings, status: forceOff ? { usb: false, midi: false } : status, permissions, active, test, lastInput, error, standby, tests, volume, icons, scene, sceneRef, media, previewScene, layoutPreview, frameListener, clearError: () => setError(""), send };
}

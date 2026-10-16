import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Profile, Settings } from "./daemon";
import { ICON_PATHS } from "./icons";
import { GLOBAL_FN, SCENE_IDS, labelOnDark, profileAt, sceneName } from "./model";
import { useScenePage } from "./scenePage";
import { useApp } from "./ctx";
import { useTween } from "./motion";

const KNOB_X: Record<string, number> = { "knob-tempo": 143, "knob-swing": 257, "knob-1": 391, "knob-2": 501, "knob-3": 612, "knob-4": 723, "knob-5": 833, "knob-6": 943, "knob-7": 1054, "knob-8": 1165, "knob-master": 1426 }, KNOB_Y = 275, R = 31;

const at = (root: SVGSVGElement | null, id: string) => {
  const t = root?.querySelector(`#${CSS.escape(id)}`)?.getAttribute("transform")?.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
  return t ? { x: Number(t[1]), y: Number(t[2]) } : null;
};
// The value arc fades from 20% at its tail to 100% at its head, built from short segments (SVG has no conic gradient).
const arc = (cx: number, cy: number, v: number) => {
  const sweep = (Math.max(0, Math.min(100, v)) / 100) * 2 * Math.PI;
  if (sweep < 0.02) return [];
  const n = Math.max(1, Math.ceil(sweep / 0.08)), out: { d: string; o: number; cap: "butt" | "round" }[] = [];
  const pt = (a: number) => `${(cx + R * Math.cos(a - Math.PI / 2)).toFixed(2)} ${(cy + R * Math.sin(a - Math.PI / 2)).toFixed(2)}`;
  for (let k = 0; k < n; k++) {
    const a0 = (sweep * k) / n, a1 = Math.min(sweep, (sweep * (k + 1)) / n + 0.012);
    out.push({ d: `M${pt(a0)} A${R} ${R} 0 0 1 ${pt(a1)}`, o: 0.2 + 0.8 * ((k + 1) / n), cap: k === 0 || k === n - 1 ? "round" : "butt" });
  }
  return out;
};
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
// A name that is too long for one line breaks at a space into two lines before anything gets cut off.
const wrapName = (s: string, n: number): string[] => {
  s = s.trim(); if (s.length <= n) return [s];
  const w = s.split(/\s+/); let best: string[] | null = null;
  for (let k = 1; k < w.length; k++) { const a = w.slice(0, k).join(" "), b = w.slice(k).join(" "); if (Math.max(a.length, b.length) <= n && (!best || Math.max(a.length, b.length) < Math.max(best[0].length, best[1].length))) best = [a, b]; }
  return best ?? [clip(s, n)];
};

// Drawn in the replica's own SVG space (inside its #device-space group, so it lines up with the controls):
// value rings with a small icon and live number under each global encoder, the names of assigned pads centred on
// the pads, and the display-button labels on the buttons. The full function is in the hover tooltip.
// The icon sits in the middle of the knob; the number replaces it while the pointer is over the knob and for a moment after
// the value changes (turned on the Push, scrolled here, or moved by a slider).
function useRecent(values: Record<string, number>, ms = 1600) {
  const prev = useRef<Record<string, number>>({});
  const [lit, setLit] = useState<Record<string, number>>({});
  useEffect(() => {
    const now = Date.now(), up: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) { if (k in prev.current && Math.round(prev.current[k]) !== Math.round(v)) up[k] = now + ms; prev.current[k] = v; }
    if (!Object.keys(up).length) return;
    setLit((l) => ({ ...l, ...up }));
    const t = window.setTimeout(() => setLit((l) => ({ ...l })), ms + 30);
    return () => clearTimeout(t);
  }, [JSON.stringify(values)]); // eslint-disable-line
  return (k: string) => (lit[k] ?? 0) > Date.now();
}

function KnobRing({ cx, v, icon, showNum }: { cx: number; v: number; icon: string; showNum: boolean }) {
  const t = useTween(v);
  return (
    <g>
      <g className={`ring-arc ${showNum ? "on" : ""}`}>
        <circle className="ring-track" cx={cx} cy={KNOB_Y} r={R} />
        {arc(cx, KNOB_Y, t).map((a, k) => <path key={k} className="ring-val" d={a.d} strokeOpacity={a.o} strokeLinecap={a.cap} />)}
      </g>
      <g className="ring-legend" pointerEvents="none">
        <g className={`ring-icon ${showNum ? "off" : ""}`} transform={`translate(${cx - 9} ${KNOB_Y - 9}) scale(.75)`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATHS[icon]} /></g>
        <text className={`ring-num ${showNum ? "on" : ""}`} x={cx} y={KNOB_Y}>{Math.round(t)}</text>
      </g>
    </g>
  );
}

export default function Rings({ overlay, settings, volume, profile, hoverId }: { overlay: SVGGElement | null; settings: Settings | null; volume: number; profile?: Profile; hoverId?: string | null }) {
  const { d, sceneHl } = useApp();
  const gk = settings?.global_knobs ?? {};
  const val = (which: string) => (which === "volume" ? volume : which === "leds" ? settings?.brightness ?? 0 : settings?.display_brightness ?? 0);
  const recent = useRecent(Object.fromEntries(Object.entries(gk).map(([k, w]) => [k, val(w)])));
  const [page, setPage] = useScenePage();   // (a hook: before any early return)
  if (!overlay || !settings?.global_knobs) return null;
  const root = overlay.ownerSVGElement;
  const names: { id: string; x: number; y: number; label: string; zone: boolean; dark: boolean }[] = [];
  for (const [id, c] of Object.entries(profile?.controls ?? {})) {
    if (!c.label) continue;
    const pad = id.startsWith("pad-"), zone = /^btn-(upper|lower)-\d$/.test(id);
    if (!pad && !zone) continue;
    const p = at(root, id);
    if (!p) continue;
    names.push({ id, zone, dark: pad && labelOnDark(c.color), label: zone && !c.keep_case ? c.label.toUpperCase() : c.label, x: p.x + (pad ? 49 : 48), y: p.y + (pad ? 35 : 20) });
  }
  // On each scene button: a dot in the colour of the profile it switches to (the same colours the buttons light on the Push); the active one is ringed.
  const scenes = SCENE_IDS.map((id, i) => ({ p: profileAt(d.profiles, page * 8 + i), i: page * 8 + i, at: at(root, id) })).filter((x) => x.at);
  const p0 = at(root, "pad-0-7"), p7 = at(root, "pad-7-7"), pb = root?.querySelector("#pad-0-7-base");
  const globalCol = p0 && p7 && pb ? { x: p0.x, y: p0.y, w: Number(pb.getAttribute("width")), h: p7.y - p0.y + Number(pb.getAttribute("height")) } : null;
  const hl = sceneHl !== null ? at(root, SCENE_IDS[sceneHl]) : null;
  return createPortal(
    <>
      {scenes.map(({ p, i, at: pt }) => p ? (
        <g key={i} className={`scene-tag ${d.active.active === p.id ? "on" : ""}`} pointerEvents="none">
          <circle cx={pt!.x + 14} cy={pt!.y + 56} r={5.5} fill={p.theme.accent} />
          <title>{sceneName(i)}</title>
        </g>
      ) : (
        <g key={i} className="scene-tag empty" pointerEvents="none"><circle cx={pt!.x + 14} cy={pt!.y + 56} r={5.5} fill="none" stroke="currentColor" strokeWidth={1.2} strokeDasharray="2.4 2.4" opacity={0.55} /><title>{sceneName(i)}: empty</title></g>
      ))}
      {scenes.length > 0 && <text className="scene-cap" x={1255} y={668}>{d.active.armed ? "PICK THE MASTER" : "PROFILES"}</text>}
      {scenes.length > 0 && <text className="scene-cap scene-page" x={1255} y={686} pointerEvents="all" style={{ cursor: "pointer" }} onClick={() => setPage(page ? 0 : 1)}>{page ? "9–16 · SHIFT" : "1–8"}  ⇄<title>Show the other eight scene buttons (hold Shift on the Push)</title></text>}
      {d.active.armed && [...SCENE_IDS, "btn-master"].map((id) => { const q = at(root, id); return q ? <rect key={id} className="scene-hl" x={q.x - 4} y={q.y - 4} width={77} height={id === "btn-master" ? 48 : 78} rx={6} pointerEvents="none" /> : null; })}
      {globalCol && <text className="scene-cap" x={globalCol.x} y={668} pointerEvents="none">GLOBAL</text>}
      {hl && <rect className="scene-hl" x={hl.x - 4} y={hl.y - 4} width={77} height={78} rx={6} pointerEvents="none" />}
      {Object.entries(settings.global_knobs).map(([knob, which]) => {
        const cx = KNOB_X[knob];
        if (cx === undefined) return null;
        return <KnobRing key={knob} cx={cx} v={val(which)} icon={GLOBAL_FN[which]?.icon ?? "knob"} showNum={hoverId === knob || recent(knob)} />;
      })}
      {names.map((n) => <text key={n.id} className={n.zone ? "zone-name" : n.dark ? "pad-name dark" : "pad-name"} x={n.x} y={n.y}>{(() => { const L = wrapName(n.label, n.zone ? 10 : 11); return L.length === 1 ? L[0] : L.map((ln, i) => <tspan key={i} x={n.x} dy={i === 0 ? "-0.55em" : "1.1em"}>{ln}</tspan>); })()}</text>)}
    </>, overlay);
}

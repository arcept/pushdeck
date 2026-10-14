import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { useApp } from "./ctx";
import { usePop } from "./motion";
import gsap from "gsap";
import { GLOBAL_FN, SCENE_IDS, describeControl, profileAt, sceneName } from "./model";
import { useScenePage } from "./scenePage";

const FIXED = new Set(["btn-repeat", "btn-setup", "btn-master"]);
const kindOf = (id: string) => (id.startsWith("knob-") ? "knob" : SCENE_IDS.includes(id) ? "scene" : id.startsWith("pad-") || id.startsWith("btn-") ? (FIXED.has(id) ? null : "slot") : null);

type Move = { from: string; to: string; x: number; y: number };

// Edit layout: drag a knob function onto another encoder, or a pad/button setup onto another pad/button.
// Dropping asks for confirmation next to the target; if the target is taken, the two swap.
export default function EditMode() {
  const { d, profile, swapControls } = useApp();
  const [drag, setDrag] = useState<{ from: string; x: number; y: number } | null>(null);
  const [move, setMove] = useState<Move | null>(null);
  const st = useRef<{ from: string; sx: number; sy: number; on: boolean; to: string | null } | null>(null);
  const gk = d.settings?.global_knobs ?? {};
  const [scenePage] = useScenePage();
  const slotOf = (id: string) => SCENE_IDS.indexOf(id) + scenePage * 8;   // the scene button on screen -> the profile slot it stands for

  const filled = (id: string) => (kindOf(id) === "scene" ? !!profileAt(d.profiles, slotOf(id)) : kindOf(id) === "knob" ? !!gk[id] : (() => { const c = profile?.controls[id]; return !!(c && (c.label || c.action || c.color || c.icon)); })());
  const name = (id: string) => (kindOf(id) === "scene" ? sceneName(slotOf(id)) : d.controls[id]?.name ?? id);
  const what = (id: string) => (kindOf(id) === "scene" ? profileAt(d.profiles, slotOf(id))?.name ?? null : kindOf(id) === "knob" ? (gk[id] ? GLOBAL_FN[gk[id]]?.title : null) : filled(id) ? describeControl(id, { name: name(id), settings: d.settings, profiles: d.profiles, pinned: d.active.pinned, profile }).primary : null);

  // mark what can be dragged
  useEffect(() => {
    const root = document.querySelector(".replica svg"); if (!root) return;
    root.querySelectorAll<SVGGElement>("g.control").forEach((g) => g.classList.toggle("edit-src", !!kindOf(g.id) && filled(g.id)));
    return () => root.querySelectorAll(".edit-src,.drop-ok,.drag-src").forEach((e) => e.classList.remove("edit-src", "drop-ok", "drag-src"));
  }, [profile, d.settings?.global_knobs, d.profiles, scenePage]); // eslint-disable-line

  useEffect(() => {
    const host = document.querySelector(".replica"); if (!host) return;
    const ctl = (el: Element | null) => (el?.closest("g.control") as SVGGElement | null);
    const clearMarks = () => host.querySelectorAll(".drop-ok,.drag-src").forEach((e) => e.classList.remove("drop-ok", "drag-src"));
    const down = (e: Event) => {
      const pe = e as PointerEvent, g = ctl(pe.target as Element);
      if (!g || !kindOf(g.id) || !filled(g.id) || pe.button !== 0) return;
      st.current = { from: g.id, sx: pe.clientX, sy: pe.clientY, on: false, to: null };
      pe.preventDefault();
    };
    const moveH = (e: PointerEvent) => {
      const s = st.current; if (!s) return;
      if (!s.on && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < 5) return;
      if (!s.on) { s.on = true; document.body.classList.add("dragging"); host.querySelector(`#${CSS.escape(s.from)}`)?.classList.add("drag-src"); }
      const g = ctl(document.elementFromPoint(e.clientX, e.clientY));
      const ok = g && g.id !== s.from && kindOf(g.id) === kindOf(s.from) ? g.id : null;
      if (ok !== s.to) { host.querySelectorAll(".drop-ok").forEach((x) => x.classList.remove("drop-ok")); if (ok) g!.classList.add("drop-ok"); s.to = ok; }
      setDrag({ from: s.from, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const s = st.current; st.current = null;
      document.body.classList.remove("dragging"); clearMarks(); setDrag(null);
      if (s?.on && s.to) setMove({ from: s.from, to: s.to, x: e.clientX, y: e.clientY });
    };
    host.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", moveH); window.addEventListener("pointerup", up);
    return () => { host.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", moveH); window.removeEventListener("pointerup", up); document.body.classList.remove("dragging"); clearMarks(); };
  }, [profile, d.settings?.global_knobs, d.controls, d.profiles, scenePage]); // eslint-disable-line

  useEffect(() => {
    if (!move) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setMove(null); };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [move]);

  const confirm = () => {
    if (!move) return;
    const { from, to } = move;
    if (kindOf(from) === "scene") {   // move the profile to the other scene button; if one is there the daemon swaps the two
      const me = profileAt(d.profiles, slotOf(from));
      if (me) d.send({ type: "set_slot", id: me.id, slot: slotOf(to) });
    } else if (kindOf(from) === "knob") {
      const g = { ...gk }, a = g[from], b = g[to];
      if (b) g[from] = b; else delete g[from];
      g[to] = a;
      d.send({ type: "set_setting", key: "global_knobs", value: g });
    } else swapControls(from, to);
    setMove(null);
    requestAnimationFrame(() => gsap.fromTo([from, to].map((i) => `.replica #${CSS.escape(i)}`).join(","), { opacity: 0.25 }, { opacity: 1, duration: 0.7, ease: "power2.out", stagger: 0.12, clearProps: "opacity" }));
  };

  const ghost = drag ? what(drag.from) : null;
  const m = move, taken = m ? filled(m.to) : false;
  // portalled to <body>: the stage's tilt gives it a 3D context, which would make position:fixed relative to the stage
  return createPortal(
    <>
      {drag && ghost && <div className="dragghost" style={{ left: drag.x + 14, top: drag.y + 14 }}>{ghost}</div>}
      {m && (
        <MovePop style={{ left: Math.max(8, Math.min(m.x - 130, window.innerWidth - 300)), top: Math.max(64, m.y + 18) }}>
          <div className="qp-title">{taken ? "Swap these two?" : "Move it here?"}</div>
          <div className="qp-sub" style={{ whiteSpace: "normal" }}>
            {taken ? <>{what(m.from)} ({name(m.from)}) and {what(m.to)} ({name(m.to)}) trade places.</> : <>{what(m.from)} moves from {name(m.from)} to {name(m.to)}.</>}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <button className="btn sm primary" autoFocus onClick={confirm}><Icon name="check" size={13} />{taken ? "Swap" : "Move"}</button>
            <button className="btn sm ghost" onClick={() => setMove(null)}>Cancel</button>
          </div>
        </MovePop>)}
    </>, document.body);
}

function MovePop({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) {
  const r = useRef<HTMLDivElement>(null); usePop(r);
  return <div ref={r} className="quickpop movepop" role="alertdialog" aria-label="Confirm move" style={style}>{children}</div>;
}

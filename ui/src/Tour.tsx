import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconPads, IconPlus, IconScreen, IconStack, IconTick } from "./OnbArt";
import "./tour.css";

// The guided tour: after the setup, the real page is dimmed except for one area at a time, with a short caption beside it.
// Start it from the setup's last step, or run it from the command palette. Esc or "Skip" ends it.
type Stop = { sel: string; title: string; text: string; side: "right" | "left" | "inset" | "below"; icon: JSX.Element };
const STOPS: Stop[] = [
  { sel: ".rail", side: "right", icon: <IconStack size={20} />, title: "Your profile", text: "Its name, colour and the apps that switch it on. Pick another profile from the top bar." },
  { sel: ".stage", side: "inset", icon: <IconPads size={20} />, title: "Your Push, live", text: "A live copy of the device. Click any pad, button or knob to set up what it does." },
  { sel: ".rightcol", side: "left", icon: <IconPlus size={20} />, title: "What a control does", text: "Choose an action here, or drag one from the list straight onto a pad on the Push." },
  { sel: ".topbar", side: "below", icon: <IconScreen size={20} />, title: "Settings and the display", text: "Push status, appearance and Settings live up here. Run this tour again from Settings → General." },
];
const W = 340, PAD = 8;

export default function Tour() {
  const [on, setOn] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cap = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLDivElement>(null), blur = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -999, top: -999 });
  useEffect(() => { const f = () => { setI(0); setOn(true); }; window.addEventListener("push-tour", f); return () => window.removeEventListener("push-tour", f); }, []);

  const measure = useCallback(() => { const el = document.querySelector(STOPS[i].sel); setRect(el ? el.getBoundingClientRect() : null); }, [i]);
  useLayoutEffect(() => { if (!on) return; measure(); window.addEventListener("resize", measure); const t = window.setInterval(measure, 400); return () => { window.removeEventListener("resize", measure); clearInterval(t); }; }, [on, measure]);
  useLayoutEffect(() => { // place the caption beside the lit area, kept inside the window
    if (!rect || !cap.current) return;
    const h = cap.current.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, st = STOPS[i];
    let left = rect.left, top = rect.top + 16;
    if (st.side === "right") left = rect.right + 18;
    else if (st.side === "left") left = rect.left - W - 18;
    else if (st.side === "below") { left = rect.left + (rect.width - W) / 2; top = rect.bottom + 18; }
    else { left = rect.left + (rect.width - W) / 2; top = rect.top + 14; }
    setPos({ left: Math.max(16, Math.min(left, vw - W - 16)), top: Math.max(16, Math.min(top, vh - h - 16)) });
  }, [rect, i]);
  useEffect(() => { // the blur follows the spotlight every frame (also while it glides): strongest at the lit area's edges, fading out to the window edges, none inside
    if (!on) return;
    let id = 0;
    const tick = () => {
      const sp = spot.current, bl = blur.current;
      if (sp && bl) {
        const r = sp.getBoundingClientRect();
        if (r.width > 4) {
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const rx = r.width / 2 * 1.42 + window.innerWidth * 0.32, ry = r.height / 2 * 1.42 + window.innerHeight * 0.32;
          const inner = Math.round(Math.min((r.width / 2 * 1.42) / rx, (r.height / 2 * 1.42) / ry) * 100);
          const set = (k: string, v: string) => { bl.style.setProperty(k, v); bl.style.setProperty("-webkit-" + k, v); };
          set("mask-image", `radial-gradient(ellipse ${rx}px ${ry}px at ${cx}px ${cy}px, #000 ${inner}%, transparent 100%), linear-gradient(#000, #000)`);
          set("mask-size", `100% 100%, ${r.width}px ${r.height}px`);
          set("mask-position", `0 0, ${r.left}px ${r.top}px`);
          set("mask-repeat", "no-repeat");
          bl.style.setProperty("mask-composite", "subtract"); bl.style.setProperty("-webkit-mask-composite", "source-out");
          bl.dataset.ready = "1"; // only show the blur once its mask is in place
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [on]);
  const close = useCallback(() => setOn(false), []);
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); else if (e.key === "ArrowRight" || e.key === "Enter") setI((n) => (n < STOPS.length - 1 ? n + 1 : (close(), n))); else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [on, close]);
  if (!on) return null;

  const st = STOPS[i], last = i === STOPS.length - 1;
  return (
    <div className="tour" role="dialog" aria-label="Guided tour">
      <div ref={blur} className="tblur" />
      <div ref={spot} className="spot" style={rect ? { left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : { left: "50%", top: "50%", width: 0, height: 0 }} />
      <div ref={cap} className="tourcap" style={{ left: pos.left, top: pos.top, width: W }} key={i}>
        <div className="tourhead"><span className="tico">{st.icon}</span><b>{st.title}</b></div>
        <p>{st.text}</p>
        <div className="tourfoot">
          <span className="tdots" aria-hidden="true">{STOPS.map((_, n) => <i key={n} className={n === i ? "now" : n < i ? "done" : ""} />)}</span>
          <span className="grow" />
          {!last && <button className="btn ghost sm" onClick={close}>Skip</button>}
          {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn primary sm" onClick={() => (last ? close() : setI(i + 1))}>{last ? <><IconTick size={14} />Done</> : "Next"}</button>
        </div>
      </div>
    </div>
  );
}

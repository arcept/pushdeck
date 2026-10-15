import { useEffect, useRef } from "react";
import { drawOrb, ORB_STATES, type OrbState } from "./display/orb";

/** A dot orb: busy states (working, searching...) or resting ones (breathing). Draws in the text colour unless `color` is given, at 30 frames a second,
 * and only while it is on screen and the window is visible. With "reduce motion" it shows one still frame. Same maths as the Push display (display/orb.ts). */
export function Orb({ state = "breathing", size = 32, color, level, className }: { state?: OrbState | string; size?: number; color?: number[]; level?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, color, level });
  live.current = { state, color, level };
  useEffect(() => {
    const cvs = ref.current; if (!cvs) return;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), px = Math.round(size * dpr);
    cvs.width = px; cvs.height = px;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = 0, visible = true;
    const parse = () => (getComputedStyle(cvs).color.match(/[\d.]+/g) ?? ["255", "255", "255"]).slice(0, 3).map(Number);
    const frame = (now: number) => {
      raf = 0;
      if (visible && !document.hidden && now - last >= 33) {
        last = now;
        const { state: s, color: c, level: lv } = live.current;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
        drawOrb(ctx, size / 2, size / 2, size * 0.46, s, c ?? parse(), still ? 2.4 : now / 1000, { level: lv, n: size < 28 ? 36 : size < 60 ? 56 : 72, dot: Math.max(0.9, size * 0.028), black: false });
      }
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(cvs);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [size]);
  return <canvas ref={ref} className={"orb" + (className ? " " + className : "")} style={{ width: size, height: size }} role="img" aria-label={`${state}`} />;
}

export { ORB_STATES };

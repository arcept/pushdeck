import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import gsap from "gsap";

export const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Pop-in for floating panels (popovers, quick editor, confirmations, toasts): a small spring from where they open.
export function usePop(ref: RefObject<HTMLElement>, from: { x?: number; y?: number } = { y: 8 }) {
  useLayoutEffect(() => {
    const el = ref.current; if (!el || reduced()) return;
    const t = gsap.fromTo(el, { opacity: 0, scale: 0.94, ...from }, { opacity: 1, scale: 1, x: 0, y: 0, duration: 0.42, ease: "back.out(1.8)", clearProps: "transform,opacity" });
    return () => { t.kill(); };
  }, []); // eslint-disable-line
}

// A number that eases to its new value instead of jumping (knob rings, readouts).
export function useTween(value: number, duration = 0.35) {
  const [v, setV] = useState(value);
  const cur = useRef({ v: value });
  useEffect(() => {
    if (reduced()) { cur.current.v = value; setV(value); return; }
    const t = gsap.to(cur.current, { v: value, duration, ease: "power2.out", onUpdate: () => setV(cur.current.v) });
    return () => { t.kill(); };
  }, [value, duration]);
  return v;
}

// App-wide motion: entrance, profile-switch wave.
export function useAppMotion(profileId: string | undefined, selected: string | null, editing: boolean) {
  const first = useRef(true);
  useLayoutEffect(() => {
    if (reduced()) return;
    const ctx = gsap.context(() => {
      gsap.from(".topbar > *", { y: -14, opacity: 0, duration: 0.6, stagger: 0.06, ease: "power3.out", clearProps: "all" });
      gsap.from(".rail", { x: -28, opacity: 0, duration: 0.7, ease: "expo.out", clearProps: "all" });
      gsap.from(".inspector", { x: 28, opacity: 0, duration: 0.7, ease: "expo.out", clearProps: "all" });
      gsap.from(".stage .replica", { y: 26, scale: 0.97, opacity: 0, duration: 0.9, delay: 0.1, ease: "expo.out" });
      gsap.from(".stagebar > *", { y: -8, opacity: 0, duration: 0.5, stagger: 0.05, delay: 0.25, ease: "power2.out", clearProps: "all" });
    });
    return () => ctx.revert();
  }, []);

  // switching profile: the pads and legends ripple in from the centre, the name slides, the rail key pops
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced() || !profileId) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(".replica g.pad", { opacity: 0.2 }, { opacity: 1, duration: 0.5, ease: "power2.out", stagger: { amount: 0.5, grid: [8, 8], from: "center" }, clearProps: "opacity" });
      gsap.from(".livegroup .psname", { y: 10, opacity: 0, duration: 0.4, ease: "power3.out", clearProps: "all" });
      gsap.fromTo(".pitem[aria-current='true'] .pkey", { scale: 0.6 }, { scale: 1, duration: 0.55, ease: "back.out(3)", clearProps: "transform" });
    });
    return () => ctx.revert();
  }, [profileId]);

  // inspector content eases in when the selection changes
  useEffect(() => {
    if (reduced()) return;
    const t = gsap.from(".inspector > *", { y: 10, opacity: 0, duration: 0.4, stagger: 0.04, ease: "power2.out", clearProps: "all" });
    return () => { t.kill(); };
  }, [selected]);

  // The replica tilts toward the pointer while it moves. A 3D-transformed layer is resampled and reads a little soft,
  // so when the pointer rests the device eases back to flat and the transform is removed: at rest it is pixel-sharp.
  useEffect(() => {
    const col = document.querySelector<HTMLElement>(".stagecol"), rep = document.querySelector<HTMLElement>(".stagecol .replica");
    if (!col || !rep || reduced() || !matchMedia("(hover: hover)").matches) return;
    gsap.set(col, { perspective: 1400 });
    let idle = 0;
    const flat = () => gsap.to(rep, { rotationX: 0, rotationY: 0, duration: 0.9, ease: "power3.out", overwrite: "auto", onComplete: () => { gsap.set(rep, { clearProps: "transform" }); } });
    const move = (e: PointerEvent) => {
      window.clearTimeout(idle);
      if (document.body.classList.contains("dragging") || col.classList.contains("editing") || col.classList.contains("arranging")) { flat(); return; }
      const r = col.getBoundingClientRect();
      gsap.to(rep, { rotationY: ((e.clientX - r.left) / r.width - 0.5) * 2.4, rotationX: -((e.clientY - r.top) / r.height - 0.5) * 1.6, duration: 0.8, ease: "power3.out", overwrite: "auto" });
      idle = window.setTimeout(flat, 650);
    };
    const leave = () => { window.clearTimeout(idle); flat(); };
    col.addEventListener("pointermove", move); col.addEventListener("pointerleave", leave);
    return () => { window.clearTimeout(idle); col.removeEventListener("pointermove", move); col.removeEventListener("pointerleave", leave); gsap.set(rep, { clearProps: "transform" }); gsap.set(col, { clearProps: "perspective" }); };
  }, []);
}

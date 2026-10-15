"use client";

import { useEffect, useRef } from "react";
import { PadField, type Geometry } from "@/lib/padfield";
import { PAD_COLORS } from "@/content";

// The Push 2 picture (public/img/push2-device.svg, built by scripts/device.mjs from the app's replica art)
// with two layers on top: a recording of the real display (public/video), and a canvas of lit pads. All three share one box,
// so any 3D transform on the box moves them together.

// The SVG's device-space -> root transform, and the cropped viewBox (keep VIEW in sync with scripts/device.mjs).
const S = 1.042253521, TX = -33.803, TY = 12.366;
export const VIEW = { x: 40, y: 0, w: 1520, h: 1460 };
const root = (x: number, y: number) => [TX + S * x, TY + S * y];

const [gx, gy] = root(346, 680);
const pitch: [number, number] = [109.8 * S, 83.5 * S];
const pad: [number, number] = [98 * S, 70 * S];
const M = 190; // room around the grid for the light the pads spill onto the body
const field = { x: gx - M, y: gy - M, w: 7 * pitch[0] + pad[0] + 2 * M, h: 7 * pitch[1] + pad[1] + 2 * M };
const geo: Geometry = { grid0: [M, M], pitch, pad, radius: 4 * S, margin: M, size: [field.w, field.h], spill: [0.09, 0.16] };
// the dark hero deck: the pads are its main light, so their light reaches further across the body
const geoLit: Geometry = { ...geo, spill: [0.32, 0.2], dark: true };
const [dx, dy] = root(340, 415);
export const DISPLAY = { x: dx, y: dy, w: 876 * S, h: 146 * S };
// The device body (device-space 90,228 1420x1142): the solid version builds its sides on this box.
const [bx, by] = root(90, 228);
const BODY = { x: bx, y: by, w: 1420 * S, h: 1142 * S };
const THICK = 0.062;
// The eleven knobs (device-space centres and radii from the SVG). In the solid version each stands up as a short cylinder.
const KNOB_H = 1.28;    // knob height as a share of its diameter (real Push 2 knobs: ~12.5 mm across, ~16 mm tall)
const KNOB_STEPS = 24;  // discs stacked to draw the wall (enough that the rims read as one smooth surface)
const KNOBS = [143, 257, 391, 501, 612, 723, 833, 943, 1054, 1165, 1426].map((x, i) => {
  const r = (i === 10 ? 27 : 24) * S, [cx, cy] = root(x, 275);
  return { left: `${((cx - r - VIEW.x) / VIEW.w) * 100}%`, top: `${((cy - r - VIEW.y) / VIEW.h) * 100}%`, width: `${((2 * r) / VIEW.w) * 100}%`, h: 2 * r * KNOB_H };
});   // side height as a share of the body width: a Push 2 is a bit under an inch thick on a ~15 inch body

// The 64 pads stand up from the body as short blocks (~1.8 mm; a pad is ~18 x 25 mm). Device-space boxes, same grid as the lit-pad canvas.
const PAD_H = 7;   // in SVG units (3.84 per mm)
const PADS = Array.from({ length: 64 }, (_, n) => {
  const r = Math.floor(n / 8), c = n % 8;
  return { x: gx + c * pitch[0], y: gy + r * pitch[1], w: pad[0], h: pad[1] };
});

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
export const box = (r: { x: number; y: number; w: number; h: number }) => ({
  left: pct(r.x - VIEW.x, VIEW.w), top: pct(r.y - VIEW.y, VIEW.h), width: pct(r.w, VIEW.w), height: pct(r.h, VIEW.h),
});

// Where this cropped device sits inside the app capture (public/img/ui/app-ui.webp, a 1600x1000 window at 2x):
// measured from the replica SVG in the running app (it sat at 340.67,193 at 0.50016 px per unit), then cropped to VIEW.
const K = 800.25 / 1600;
export const IN_APP = { left: (340.671875 + VIEW.x * K) / 1600, top: (193 + VIEW.y * K) / 1000, width: (VIEW.w * K) / 1600, height: (VIEW.h * K) / 1000 };

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

// Which pads rest lit: a few diagonal stripes. Everything else is dark until a hit ripples through it or the pointer rests on it.
const LIT = (r: number, c: number) => (r + c) % 4 === 0;

/** A pad layout from a palette (indexes into PAD_COLORS). */
export function padsFor(palette: number[]) {
  const colors: [number, number, number][] = [], base: number[] = [];
  for (let n = 0; n < 64; n++) {
    const r = Math.floor(n / 8), c = n % 8;
    colors.push(rgb(PAD_COLORS[palette[(r + Math.floor(c / 2)) % palette.length]]));
    base.push(LIT(r, c) ? 0.55 : 0);
  }
  return { colors, base };
}

export default function Device({ palette, display = "/video/hero.mp4", autoplay = true, intro = 0, paused = false, solid = false, label }: { palette: number[]; display?: string; autoplay?: boolean; intro?: number; paused?: boolean; solid?: boolean; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const dev = useRef<HTMLDivElement>(null);

  // 3D depths are px (CSS can't size a translateZ by width on its own): --t = side height, --u = px per SVG unit (for the knobs)
  useEffect(() => {
    const b = body.current, d = dev.current; if (!b || !d) return;
    const set = () => { b.style.setProperty("--t", `${b.offsetWidth * THICK}px`); d.style.setProperty("--u", `${d.offsetWidth / VIEW.w}px`); d.style.setProperty("--pad-h", `${(d.offsetWidth / VIEW.w) * PAD_H}px`); };
    set(); const ro = new ResizeObserver(set); ro.observe(d);
    return () => ro.disconnect();
  }, [solid]);
  const pf = useRef<PadField | null>(null);
  const lastPad = useRef<string>("");

  useEffect(() => {
    const cv = canvas.current; if (!cv) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const f = new PadField(cv, solid ? geoLit : geo, { autoplay: autoplay && !still, still });
    const { colors, base } = padsFor(palette);
    f.setPads(colors, base, true);
    pf.current = f;
    f.start().then(() => { cv.dataset.mode = f.mode; });
    // the first light-up: a ring from the middle of the grid
    const t = intro && !still ? window.setTimeout(() => { f.hit(3, 3, 1); f.hit(4, 4, 1); }, intro * 1000) : 0;
    return () => { clearTimeout(t); f.destroy(); pf.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const { colors, base } = padsFor(palette);
    pf.current?.setPads(colors, base);
  }, [palette]);

  useEffect(() => { if (pf.current) pf.current.paused = paused; }, [paused]);

  // hover lights the pad under the pointer (a small ring runs out as you enter it); a click hits it harder
  const play = (e: React.PointerEvent<HTMLCanvasElement>, amp: number) => {
    const f = pf.current; if (!f) return;
    const p = f.padAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    const key = p ? p.join() : "";
    f.setHover(p ? p[0] * 8 + p[1] : -1);
    if (p && (amp === 1 || key !== lastPad.current)) f.hit(p[0], p[1], amp);
    lastPad.current = key;
  };

  const canvasEl = (
    <canvas
      ref={canvas}
      className={solid ? "device-pads lift" : "device-pads"}
      style={box(field)}
      onPointerMove={(e) => play(e, 0.4)}
      onPointerDown={(e) => play(e, 1)}
      onPointerLeave={() => { lastPad.current = ""; pf.current?.setHover(-1); }}
    />
  );

  return (
    <div ref={dev} className={solid ? "device solid" : "device"} role="img" aria-label={label} style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
      {/* solid: four sides and a contact shadow behind the top face, so in perspective it reads as a real slab. Static; the tilt does the rest. */}
      {solid && (
        <div className="body3d" ref={body} style={box(BODY)} aria-hidden="true">
          <i className="floor" /><i className="side s-bottom" /><i className="side s-top" /><i className="side s-left" /><i className="side s-right" />
        </div>
      )}
      <div className="front">
      <img className="device-art" src="/img/push2-device.svg" alt="" width={VIEW.w} height={VIEW.h} draggable={false} />
      {/* solid (the hero): the room is dark. The body falls off to near-black toward the bottom; the display and pads (above this) are the light */}
      {solid && <div className="shade" style={box(BODY)} aria-hidden="true" />}
      {/* the backlit buttons and legends (scripts/device.mjs), above the shade so they glow in the dark */}
      <img className="device-lights" src="/img/push2-lights.svg" alt="" width={VIEW.w} height={VIEW.h} draggable={false} />
      {solid && <div className="disp-glow" style={box({ x: DISPLAY.x - 120, y: DISPLAY.y - 110, w: DISPLAY.w + 240, h: DISPLAY.h + 220 })} aria-hidden="true" />}
      <video className="device-display" src={display} style={box(DISPLAY)} autoPlay muted loop playsInline preload="auto" aria-hidden="true" />
      {!solid && canvasEl}
      {solid && <div className="sheen" style={box(BODY)} aria-hidden="true" />}
      </div>
      {/* solid: each pad is a block with four walls; the lit canvas sits on their tops (lifted by --pad-h) */}
      {solid && (
        <div className="pads3d" aria-hidden="true">
          {PADS.map((p, n) => (
            <div key={n} className="pad3d" style={box(p)}>
              <i className="pw pw-b" /><i className="pw pw-t" /><i className="pw pw-l" /><i className="pw pw-r" />
            </div>
          ))}
        </div>
      )}
      {solid && canvasEl}
      {solid && (
        <div className="knobs3d" aria-hidden="true">
          {KNOBS.map((k, n) => (
            <div key={n} className="knob3d" style={{ left: k.left, top: k.top, width: k.width, ["--kh" as string]: `calc(var(--u) * ${k.h.toFixed(2)})` }}>
              {Array.from({ length: KNOB_STEPS + 1 }, (_, i) => <i key={i} className={i === KNOB_STEPS ? "cap" : ""} style={{ ["--k" as string]: i / KNOB_STEPS }} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

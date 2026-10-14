"use client";

import { useEffect, useRef } from "react";
import { PadField, type Geometry } from "@/lib/padfield";
import { PAD_COLORS } from "@/content";

// The Push 2 picture (public/img/push2-device.svg, built by scripts/device.mjs from the app's replica art)
// with two layers on top: the real display recording, and a canvas of lit pads. All three share one box,
// so any 3D transform on the box moves them together.

// The SVG's device-space -> root transform, and the cropped viewBox (keep VIEW in sync with scripts/device.mjs).
const S = 1.042253521, TX = -33.803, TY = 12.366;
const VIEW = { x: 40, y: 200, w: 1520, h: 1260 };
const root = (x: number, y: number) => [TX + S * x, TY + S * y];

const [gx, gy] = root(346, 680);
const pitch: [number, number] = [109.8 * S, 83.5 * S];
const pad: [number, number] = [98 * S, 70 * S];
const M = 70; // room around the grid for the glow
const field = { x: gx - M, y: gy - M, w: 7 * pitch[0] + pad[0] + 2 * M, h: 7 * pitch[1] + pad[1] + 2 * M };
const geo: Geometry = { grid0: [M, M], pitch, pad, radius: 4 * S, margin: M, size: [field.w, field.h] };
const [dx, dy] = root(340, 415);
const disp = { x: dx, y: dy, w: 876 * S, h: 146 * S };

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const box = (r: { x: number; y: number; w: number; h: number }) => ({
  left: pct(r.x - VIEW.x, VIEW.w), top: pct(r.y - VIEW.y, VIEW.h), width: pct(r.w, VIEW.w), height: pct(r.h, VIEW.h),
});

// Where this cropped device sits inside the app capture (public/img/ui/app-ui.webp, a 1600x1000 window at 2x):
// measured from the replica SVG in the running app (it sat at 340.67,193 at 0.50016 px per unit), then cropped to VIEW.
const K = 800.25 / 1600;
export const IN_APP = { left: (340.671875 + VIEW.x * K) / 1600, top: (193 + VIEW.y * K) / 1000, width: (VIEW.w * K) / 1600, height: (VIEW.h * K) / 1000 };

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

/** A pad layout from a palette (indexes into PAD_COLORS): coloured rows with a few pads left dark, like a real profile. */
export function padsFor(palette: number[]) {
  const colors: [number, number, number][] = [], base: number[] = [];
  for (let n = 0; n < 64; n++) {
    const r = Math.floor(n / 8), c = n % 8;
    colors.push(rgb(PAD_COLORS[palette[(r + Math.floor(c / 2)) % palette.length]]));
    base.push((r * 7 + c * 5) % 5 === 0 ? 0.05 : 0.5);
  }
  return { colors, base };
}

export default function Device({ palette, autoplay = true, intro = 0, paused = false, label }: { palette: number[]; autoplay?: boolean; intro?: number; paused?: boolean; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pf = useRef<PadField | null>(null);
  const lastPad = useRef<string>("");

  useEffect(() => {
    const cv = canvas.current; if (!cv) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const f = new PadField(cv, geo, { autoplay: autoplay && !still, still });
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

  const play = (e: React.PointerEvent<HTMLCanvasElement>, amp: number) => {
    const f = pf.current; if (!f) return;
    const p = f.padAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    const key = p ? p.join() : "";
    if (p && (amp === 1 || key !== lastPad.current)) f.hit(p[0], p[1], amp);
    lastPad.current = key;
  };

  return (
    <div className="device" role="img" aria-label={label} style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
      <img className="device-art" src="/img/push2-device.svg" alt="" width={VIEW.w} height={VIEW.h} draggable={false} />
      <img className="device-display" src="/img/display.gif" alt="" style={box(disp)} />
      <canvas
        ref={canvas}
        className="device-pads"
        style={box(field)}
        onPointerMove={(e) => play(e, 0.8)}
        onPointerDown={(e) => play(e, 1)}
        onPointerLeave={() => { lastPad.current = ""; }}
      />
    </div>
  );
}

// Dot orbs: a cloud of dots that swirls into a different shape for each state. Mirrors daemon/push_daemon/display/orb.py (and the menu bar's Orb.swift): change all three together.
export const ORB_STATES = ["breathing", "working", "searching", "solving", "listening", "connecting", "composing", "weaving"] as const;
export type OrbState = (typeof ORB_STATES)[number];
export type Dot = { x: number; y: number; depth: number; bright: number };
const GA = 2.399963229728653, TILT = 0.35, TAU = Math.PI * 2;
const frac = (v: number) => v - Math.floor(v);

/** The dots at time t (seconds): x and y in -1..1 of the orb's radius, depth 0..1 (1 = nearest), brightness 0..1. */
export function orbPoints(state: string, t: number, n = 72, level?: number): Dot[] {
  const lv = level ?? 0.35 + 0.35 * Math.sin(t * 2.6) ** 2, out: Dot[] = [], ct = Math.cos(TILT), st = Math.sin(TILT), ringN = n / 3;
  for (let i = 0; i < n; i++) {
    const h = frac(i * 0.6180339887498949), u = 1 - 2 * (i + 0.5) / n, s = Math.sqrt(Math.max(0, 1 - u * u)), phi = i * GA;
    let x = s * Math.cos(phi), y = u, z = s * Math.sin(phi), yaw = 0, bright = 1;
    const scale = (r: number) => { x *= r; y *= r; z *= r; };
    if (state === "breathing") { yaw = t * 0.3; scale(0.78 + 0.12 * Math.sin(t * 1.5)); }
    else if (state === "working") { yaw = t * 2.4; scale(0.88 + 0.07 * Math.sin(t * 6 + h * TAU)); }
    else if (state === "searching") { yaw = t * 0.8; bright = 0.35 + 0.65 * Math.exp(-(((y - Math.sin(t * 1.6) * 0.85) / 0.22) ** 2)); scale(0.9); }
    else if (state === "solving") {
      const k = i % 3, m = Math.floor(i / 3), a = m / ringN * TAU + t * (1.3 + 0.5 * k) * (k % 2 ? -1 : 1), px = 0.9 * Math.cos(a), ang = k * Math.PI / 3;
      y = 0.9 * Math.sin(a); x = px * Math.cos(ang); z = -px * Math.sin(ang); yaw = t * 0.4;
    }
    else if (state === "listening") { yaw = t * 0.5; bright = 0.5 + 0.5 * Math.min(1, lv * 1.4); scale(0.5 + lv * 0.5 * (0.35 + 0.65 * Math.abs(Math.sin(h * 37 + t * 8)))); }
    else if (state === "connecting") {
      const q = Math.min(((t * 0.45) % 1) / 0.7, 1), k = q * q * (3 - 2 * q);
      yaw = t * (0.5 + 1.5 * k); bright = 0.3 + 0.7 * k; scale(0.9 + (1 - k) * 1.3 * (0.3 + h));
    }
    else if (state === "composing") { yaw = t * 0.9; scale(0.84 + 0.13 * Math.sin(y * 6.5 - t * 3.5)); }
    else if (state === "weaving") {
      const a = t * 1.7; scale(0.88);
      if (i % 2 === 0) [x, z] = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
      else [x, y] = [x * Math.cos(-a) - y * Math.sin(-a), x * Math.sin(-a) + y * Math.cos(-a)];
    }
    [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    [y, z] = [y * ct - z * st, y * st + z * ct];
    out.push({ x, y, depth: Math.max(0, Math.min(1, (z + 1) / 2)), bright });
  }
  return out;
}

/** Draw an orb centred on (cx, cy). color is [r, g, b]; on the display the ground is black, so dimmer = closer to black (alpha does the same on any dark ground). */
export function drawOrb(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, state: string, color: number[], t: number, o: { level?: number; n?: number; dot?: number; black?: boolean } = {}) {
  const dot = o.dot ?? radius * 0.055;
  for (const p of orbPoints(state, t, o.n ?? 72, o.level)) {
    const a = p.bright * (0.3 + 0.7 * p.depth), r = dot * (0.5 + 0.8 * p.depth);
    ctx.fillStyle = o.black === false ? `rgba(${color[0]},${color[1]},${color[2]},${a})` : `rgb(${Math.round(color[0] * a)},${Math.round(color[1] * a)},${Math.round(color[2] * a)})`;
    ctx.beginPath(); ctx.arc(cx + p.x * radius, cy + p.y * radius, r, 0, TAU); ctx.fill();
  }
}

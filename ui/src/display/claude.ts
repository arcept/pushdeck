// The Claude session widget's drawing, mirroring daemon/push_daemon/display/render_claude.py: change both together.
// Layout: app chip + chat title + state pill on top, current action and task count under it, then a thick animated progress bar with the
// mascot standing on it, walking with the progress. Bars: neon / plasma / classic. Mascots: pip / pixel (sprite sheets
// from tools/make_sprites.py) and classic (the original pixel critter, passed in as `h.oldCritter`).
import meta from "./mascots.json";
import pipUrl from "./mascot_pip.png";
import pixelUrl from "./mascot_pixel.png";

type Ctx = CanvasRenderingContext2D;
type RGB = [number, number, number];
export type Helpers = {
  text: (ctx: Ctx, x: number, y: number, s: string, size: number, color: string, role?: "label" | "mono", bold?: boolean, align?: CanvasTextAlign) => void;
  width: (ctx: Ctx, s: string, size: number, role?: "label" | "mono", bold?: boolean) => number;
  clip: (ctx: Ctx, s: string, size: number, maxw: number) => string;
  rrect: (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, fill?: string, stroke?: string, lw?: number) => void;
  replyBlock: (str: string, scroll: number, size: number, x: number, yFirst: number, pitch: number, n: number, maxw: number, xr: number) => void;
  oldCritter: (x: number, bottom: number, k: number, body: string, activity: string, phase: number, o: { sleep?: boolean; jump?: number; slow?: boolean }) => void;
  sparkle: (cx: number, cy: number, c: string) => void;
  confetti: (x0: number, y0: number, x1: number, y1: number, age: number) => void;
};

const U = meta.units, PX = meta.px, NF = meta.frames, KROW: Record<string, number> = Object.fromEntries(meta.kinds.map((k, i) => [k, i]));
const sheets: Record<string, HTMLImageElement> = {};
const sheet = (look: string) => { let im = sheets[look]; if (!im) { im = new Image(); im.src = look === "pixel" ? pixelUrl : pipUrl; sheets[look] = im; } return im; };
const smoothed = new Map<string, [number, number]>();

const NEON: [RGB, RGB][] = [[[60, 230, 255], [40, 140, 255]], [[90, 170, 255], [110, 90, 255]], [[150, 110, 255], [210, 70, 255]], [[230, 80, 230], [255, 70, 150]], [[255, 100, 110], [255, 150, 60]], [[255, 190, 60], [255, 225, 110]]];
const FLOW: RGB[] = [[70, 120, 255], [170, 80, 255], [255, 80, 170], [255, 170, 60], [70, 220, 255], [70, 120, 255]];
const KIND_OF: Record<string, string> = { read: "reader", edit: "builder", run: "runner", plan: "planner", agent: "planner", think: "thinker" };
const OLD_ACT: Record<string, string> = { reader: "read", builder: "edit", runner: "run", planner: "plan", thinker: "think", done: "cheer", timer: "hourglass" };
const STATE_COL: Record<string, RGB> = { ask: [120, 180, 255], working: [255, 176, 64], idle: [150, 158, 190], done: [110, 230, 130], none: [90, 92, 110] };
const CREW = ["crew1", "crew2", "crew3", "crew1"];

const rgb = (c: RGB, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
const mixc = (a: RGB, b: RGB, t: number): RGB => { const k = Math.max(0, Math.min(1, t)); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; };
const stopsAt = (stops: RGB[], u: number): RGB => { const v = Math.max(0, Math.min(1, u)) * (stops.length - 1), j = Math.min(Math.floor(v), stops.length - 2); return mixc(stops[j], stops[j + 1], v - j); };
const neonAt = (u: number): [RGB, RGB] => { const v = Math.max(0, Math.min(1, u)) * (NEON.length - 1), j = Math.min(Math.floor(v), NEON.length - 2), f = v - j; return [mixc(NEON[j][0], NEON[j + 1][0], f), mixc(NEON[j][1], NEON[j + 1][1], f)]; };
const hex = (h: string): RGB => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function smooth(key: string, target: number, t: number, rate = 7) { // eases a value toward its target so heads glide instead of jumping
  const [v0, last] = smoothed.get(key) ?? [target, t], dt = Math.max(0, Math.min(0.2, t - last));
  const v = Math.abs(target - v0) < 0.02 ? target : v0 + (target - v0) * (1 - Math.exp(-dt * rate));
  smoothed.set(key, [v, t]); return v;
}
const scale = (ctx: Ctx) => ctx.getTransform().a || 1;

function cap(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c0: RGB, c1: RGB, glow = 0) { // a capsule with a vertical gradient and a gloss, plus glow
  if (x1 - x0 < 1) return;
  const h = y1 - y0;
  ctx.save();
  if (glow) { ctx.shadowColor = rgb(c1, Math.min(1, 0.9 * glow + 0.1)); ctx.shadowBlur = glow * 18 * scale(ctx); }
  const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, rgb(c0)); g.addColorStop(1, rgb(c1));
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, h, h / 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.36)"; ctx.beginPath();
  if (x1 - x0 > h * 0.9) ctx.roundRect(x0 + h * 0.3, y0 + h * 0.14, x1 - x0 - h * 0.6, h * 0.3, h * 0.15); else ctx.rect(x0 + (x1 - x0) * 0.2, y0 + h * 0.12, (x1 - x0) * 0.25, h * 0.58);
  ctx.fill();
}
function flat(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c: RGB) { // a hard-edged rectangle on whole display pixels (the pixel look has no rounding)
  const a = Math.round(x0), b = Math.round(y0), e = Math.round(x1), d = Math.round(y1);
  if (e > a && d > b) { ctx.fillStyle = rgb(c); ctx.fillRect(a, b, e - a, d - b); }
}
function tint(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c: RGB, a: number, r = 2) { ctx.fillStyle = rgb(c, a); ctx.beginPath(); ctx.roundRect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0), r); ctx.fill(); }
function orb(ctx: Ctx, cx: number, cy: number, r: number, c: RGB, strength = 1) { // a glowing dot
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6);
  g.addColorStop(0, rgb([255, 255, 255], Math.min(1, strength))); g.addColorStop(0.25, rgb(c, 0.9 * strength)); g.addColorStop(0.5, rgb(c, 0.35 * strength)); g.addColorStop(1, rgb(c, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2); ctx.fill();
}

const tomatoCells = new Map<string, HTMLCanvasElement>();
/** The mascot as a tomato: its orange turns tomato red and a green leaf crowns its head (one cell, cached). Mirrors tomatoize() in render_claude.py. */
function tomatoCell(look: string, im: HTMLImageElement, f: number, row: number, cell: number): HTMLCanvasElement {
  const key = `${look}/${f}/${row}`; let c = tomatoCells.get(key);
  if (c) return c;
  c = document.createElement("canvas"); c.width = c.height = cell;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(im, f * cell, row * cell, cell, cell, 0, 0, cell, cell);
  const img = g.getImageData(0, 0, cell, cell), d = img.data;
  let x0 = cell, x1 = -1, top = cell;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a > 0 && r > 150 && r - b > 60 && gg > b && gg < r * 0.8) { d[i + 1] = Math.floor(gg * 0.42); d[i + 2] = Math.floor(b * 0.45); }
    if (a > 20) { const p = i / 4, x = p % cell, y = Math.floor(p / cell); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < top) top = y; }
  }
  g.putImageData(img, 0, 0);
  if (x1 >= 0) {
    const cx = (x0 + x1) / 2, wd = x1 - x0, lw = wd * 0.34, lh = wd * 0.16;
    g.fillStyle = "#3f9b4a";
    for (const [dx, dy] of [[-1, -0.35], [1, -0.35], [-0.5, 0.2], [0.5, 0.2]]) { g.beginPath(); g.moveTo(cx, top + lh * 0.6); g.lineTo(cx + dx * lw, top + lh * 0.6 + dy * lh); g.lineTo(cx + dx * lw * 0.45, top + lh * 1.3); g.closePath(); g.fill(); }
  }
  tomatoCells.set(key, c);
  return c;
}
export function mascot(ctx: Ctx, h: Helpers, look: string, kind: string, cx: number, foot: number, k: number, tt: number, o: { jump?: number; phase?: number; moving?: boolean; rate?: number; body?: string; tomato?: boolean } = {}) {
  const jump = o.jump ?? 0, phase = o.phase ?? 0, moving = o.moving ?? true, rate = o.rate ?? 11;
  if (o.tomato) o = { ...o, body: "#e5483b" };
  if (look === "classic") {
    const kk = k >= 0.8 ? 3 : k >= 0.55 ? 2 : 1;
    h.oldCritter(cx - 6 * kk, foot, kk, o.body ?? "#d97757", OLD_ACT[kind] ?? "", phase, { sleep: kind === "sleep", jump, slow: !moving || rate < 8 });
    return;
  }
  let im: CanvasImageSource = sheet(look);
  if (!(im as HTMLImageElement).complete || !(im as HTMLImageElement).naturalWidth) return;
  let f: number;
  if (kind === "sleep") f = Math.floor(tt * 5 + phase) % NF;
  else { f = moving ? Math.floor(tt * rate + phase * 8) % 8 : 0; if ((tt + phase) % 3.7 < 0.16) f = f < 4 ? 8 : 9; }
  const sc = (meta.scale as Record<string, number>)[look] ?? PX, cell = Math.round(U * sc), row = KROW[kind] ?? 0;
  let sx = f * cell, sy = row * cell;
  if (o.tomato) { im = tomatoCell(look, im as HTMLImageElement, f, row, cell); sx = 0; sy = 0; }
  ctx.save();
  if (look === "pixel") { // whole display pixels per sprite pixel, a little larger than the others, snapped to the pixel grid
    const n = Math.max(1, Math.floor(k * 1.25 / sc)), ku = sc * n;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, sx, sy, cell, cell, Math.round(cx - meta.cx * ku), Math.round(foot - jump - meta.foot * ku), cell * n, cell * n);
  } else {
    const size = Math.max(2, Math.round(U * k * 2)) / 2;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, sx, sy, cell, cell, cx - meta.cx * k, foot - jump - meta.foot * k, size, size);
  }
  ctx.restore();
}
export function buddy(ctx: Ctx, h: Helpers, look: string, kind: string, xl: number, foot: number, kold: number, o: { jump?: number; body?: string; moving?: boolean; tomato?: boolean } = {}) { // the small mascot of the usage and clock widgets
  mascot(ctx, h, look, kind, xl + 6 * kold, foot, kold === 1 ? 0.55 : 0.8, performance.now() / 1000, { jump: o.jump, body: o.body, moving: o.moving, rate: 6, tomato: o.tomato });
}

/** A small flat animated icon for what it is doing right now; x is its left edge, cy its centre line. */
function glyph(ctx: Ctx, x: number, cy: number, act: string, tt: number, col: [number, number, number]) {
  const n = 12, y = cy - n / 2, c = rgb(col), dim = rgb(mixc([0, 0, 0], col, 0.35));
  const R = (a: number, b: number, e: number, d: number, f: string) => { ctx.fillStyle = f; ctx.fillRect(x + a, y + b, e - a, d - b); };
  if (act === "compact") {
    const g = (Math.sin(tt * 4.5) + 1) / 2;
    R(0, 1, 3, n - 1, c); R(n - 3, 1, n, n - 1, c); R(3 + g * 2, 3, n - 3 - g * 2, n - 3, dim);
  } else if (act === "read") {
    R(1, 0, n - 1, n, dim); R(2, 1, n - 2, n - 1, "#0c0c12");
    const sy = 2 + Math.floor(((tt * 1.6) % 1) * (n - 5)); R(2, sy, n - 2, sy + 2, c);
  } else if (act === "edit") {
    for (let i = 0; i < 3; i++) { const w = Math.max(0, Math.min(n - 2, Math.floor((((tt * 0.9 - i * 0.3) % 1.6 + 1.6) % 1.6) / 1.2 * (n - 2)))); R(1, 1 + i * 4, 1 + w, 3 + i * 4, c); }
  } else if (act === "run") {
    for (let i = 0; i < 3; i++) { R(1 + i, 2 + i, 3 + i, 4 + i, c); R(1 + i, 8 - i, 3 + i, 10 - i, c); }
    if (Math.floor(tt * 2.5) % 2 === 0) R(6, 9, 11, 11, c);
  } else if (act === "plan") {
    const k = Math.floor(tt * 1.6) % 4;
    for (let i = 0; i < 3; i++) { R(0, 1 + i * 4, 3, 4 + i * 4, k > i ? c : dim); R(5, 2 + i * 4, n, 3 + i * 4, dim); }
  } else if (act === "agent") {
    for (let j = 0; j < 2; j++) { const a = tt * 5 + j * Math.PI, px = n / 2 + Math.cos(a) * 4, py = n / 2 + Math.sin(a) * 4; R(px - 1.5, py - 1.5, px + 1.5, py + 1.5, c); }
  } else {
    const k = Math.floor(tt * 5) % 4;
    for (let i = 0; i < 3; i++) { const up = k === i ? 2 : 0; R(i * 4, 6 - up, i * 4 + 3, 9 - up, k === i ? c : dim); }
  }
}

function chip(ctx: Ctx, h: Helpers, x: number, y: number, size: number, app: string, host: string, mode: string) { // what kind of session: </> Claude Code, bubble chat/cowork, VS Code mark, >_ terminal; a badge tells where it runs
  const col: RGB = ({ desktop: [217, 119, 87], code: [59, 156, 255], terminal: [98, 224, 160] } as Record<string, RGB>)[app] ?? [150, 158, 190];
  const tile = rgb(mixc([16, 16, 24], col, 0.16));
  h.rrect(ctx, x, y, x + size, y + size, size * 0.3, tile, rgb(mixc([16, 16, 24], col, 0.55)), 1);
  const cx = x + size / 2, cy = y + size / 2, u = size / 24, c = rgb(col);
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const poly = (...pts: number[][]) => { ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); };
  if (app === "code") {
    poly([cx + 1.5 * u, cy - 8 * u], [cx + 8 * u, cy - 5 * u], [cx + 8 * u, cy + 5 * u], [cx + 1.5 * u, cy + 8 * u]); ctx.fill();
    ctx.lineWidth = 2 * u; poly([cx - 2 * u, cy - 5.5 * u], [cx - 7.5 * u, cy], [cx - 2 * u, cy + 5.5 * u]); ctx.stroke();
    ctx.strokeStyle = tile; ctx.lineWidth = 1.6 * u; poly([cx - 2.5 * u, cy - 3.6 * u], [cx + 3.5 * u, cy + 0.2 * u], [cx - 2.5 * u, cy + 3.6 * u]); ctx.stroke();
  } else if (app === "terminal") {
    ctx.lineWidth = 2 * u; poly([cx - 7 * u, cy - 4.6 * u], [cx - 2.6 * u, cy], [cx - 7 * u, cy + 4.6 * u]); ctx.stroke();
    poly([cx + 0.5 * u, cy + 5 * u], [cx + 7.5 * u, cy + 5 * u]); ctx.stroke();
  } else if (mode === "chat" || mode === "cowork") {
    ctx.beginPath(); ctx.roundRect(cx - 8 * u, cy - 7 * u, 16 * u, 10.5 * u, 3 * u); ctx.fill();
    poly([cx - 4.5 * u, cy + 3 * u], [cx - 5.5 * u, cy + 8 * u], [cx + 1 * u, cy + 3 * u]); ctx.fill();
    ctx.fillStyle = tile; for (const dx of [-4, 0, 4]) { ctx.beginPath(); ctx.arc(cx + dx * u, cy - 2.5 * u, 1.1 * u, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.lineWidth = 2 * u; for (const sx of [-1, 1]) { poly([cx + sx * 3.2 * u, cy - 5 * u], [cx + sx * 8 * u, cy], [cx + sx * 3.2 * u, cy + 5 * u]); ctx.stroke(); }
    ctx.lineWidth = 1.8 * u; poly([cx + 1.6 * u, cy - 6 * u], [cx - 1.6 * u, cy + 6 * u]); ctx.stroke();
  }
  const bx = x + size - 3, by = y + size - 3, br = size * 0.27;
  ctx.fillStyle = "#0a0a10"; ctx.strokeStyle = "#464a64"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (host === "cloud") { ctx.fillStyle = "#bed2ff"; ctx.beginPath(); ctx.ellipse(bx, by + br * 0.2, br * 0.6, br * 0.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(bx + br * 0.05, by - br * 0.2, br * 0.35, br * 0.4, 0, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.fillStyle = "#78ebaa"; ctx.beginPath(); ctx.roundRect(bx - br * 0.5, by - br * 0.5, br, br * 0.65, 1); ctx.fill(); ctx.strokeStyle = "#78ebaa"; ctx.beginPath(); ctx.moveTo(bx - br * 0.7, by + br * 0.4); ctx.lineTo(bx + br * 0.7, by + br * 0.4); ctx.stroke(); }
}

function statePill(ctx: Ctx, h: Helpers, xr: number, yc: number, text: string, c: RGB, size: number): number { // flat: a quiet tint of the state colour, no outline, no glow
  const wd = h.width(ctx, text, size, "mono", true) + 18, x0 = xr - wd, y0 = yc - 10, y1 = yc + 10;
  h.rrect(ctx, x0, y0, xr, y1, 10, rgb(mixc([0, 0, 0], c, 0.16)));
  h.text(ctx, x0 + wd / 2, yc, text, size, rgb(c), "mono", true, "center");
  return wd;
}

// ---- the bar ----
function claudeBar(ctx: Ctx, style: string, xa: number, y: number, xb: number, hh: number, items: string[], prog: number, tt: number, key: string): [number, number] {
  const n = items.length, headTarget = xa + (xb - xa) * prog;
  if (!["neon", "plasma", "classic"].includes(style)) style = "neon";
  if ((style === "neon" || style === "classic") && n >= 1) {
    const gap = style === "neon" ? 4 : 3, sw = (xb - xa - gap * (n - 1)) / n;
    if (sw >= (style === "neon" ? 7 : 4)) return segments(ctx, style, xa, y, xb, hh, items, sw, gap, tt, key);
    style = style === "neon" ? "flat" : "plasma";
  }
  if (style === "classic") style = "plasma";
  const hx = smooth("h" + key, headTarget, tt);
  if (style === "plasma") { plasma(ctx, xa, y, xb, hh, hx, tt); return [hx, y - 0.5]; }
  if (style === "flat") { // many tasks: one flat pixel bar, colour stepping every 8 px
    flat(ctx, xa, y, xb, y + hh, [34, 34, 48]);
    const ex = xa + Math.round((hx - xa) / 4) * 4;
    for (let px = Math.floor(xa); px < ex; px += 8) { const [c0, c1] = neonAt((px - xa) / Math.max(1, xb - xa)); flat(ctx, px, y, Math.min(px + 8, ex), y + hh, mixc(c0, c1, 0.5)); }
    if (0.5 + 0.5 * Math.sin(tt * 2.6) > 0.35) flat(ctx, ex - 2, y - 2, ex + 2, y + hh + 2, [255, 255, 255]);
    return [hx, y - 0.5];
  }
  return [hx, y];
}
function segments(ctx: Ctx, style: string, xa: number, y: number, xb: number, hh: number, items: string[], sw: number, gap: number, tt: number, key: string): [number, number] {
  const n = items.length, pulse = 0.5 + 0.5 * Math.sin(tt * 2.6), sweep = xa + (((tt * 0.4) % 1.4) - 0.2) * (xb - xa);
  let head = xa;
  items.forEach((st, i) => {
    const sx = xa + i * (sw + gap);
    if (style === "classic") {
      const th = Math.min(8, hh), yy = y + (hh - th) / 2, r = Math.min(3, th / 2);
      if (st === "p") { tint(ctx, sx, yy, sx + sw, yy + th, [34, 34, 46], 1, r); return; }
      head = st === "a" ? sx + sw / 2 : sx + sw;
      const hue = mixc([217, 119, 87], [245, 197, 66], i / Math.max(1, n - 1)), base = st === "c" ? hue : hue.map((c) => c * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(tt * 5)))) as RGB;
      tint(ctx, sx, yy, sx + sw, yy + th, mixc(base, [255, 255, 255], 0.4 * Math.max(0, 1 - Math.abs(sx + sw / 2 - sweep) / 46)), 1, r);
      return;
    }
    if (style === "neon") { // flat and pixelated: square edges, solid colours, steps of 4 px
      flat(ctx, sx, y, sx + sw, y + hh, [34, 34, 48]);
      if (st === "p") return;
      const [n0, n1] = neonAt(i / Math.max(1, n - 1)), col = mixc(n0, n1, 0.5);
      const ex = st === "a" ? sx + Math.max(8, Math.round(sw * (0.30 + 0.28 * (0.5 + 0.5 * Math.sin(tt * 2.2 + i))) / 4) * 4) : sx + sw;
      flat(ctx, sx, y, ex, y + hh, col); head = ex;
      const lo = Math.max(sx, Math.round((sweep - 6) / 4) * 4), hi = Math.min(ex, lo + 4); // a 4 px light band stepping along the finished work
      if (st === "c" && hi > lo) flat(ctx, lo, y, hi, y + hh, mixc(col, [255, 255, 255], 0.3));
      return;
    }
    cap(ctx, sx, y, sx + sw, y + hh, [34, 34, 48], [22, 22, 32]);
    if (st === "p") return;
    const [c0, c1] = neonAt(i / Math.max(1, n - 1));
    if (st === "a") { const ex = sx + Math.max(hh, sw * (0.30 + 0.28 * (0.5 + 0.5 * Math.sin(tt * 2.2 + i)))); cap(ctx, sx, y, ex, y + hh, c0, c1); head = ex; }
    else {
      cap(ctx, sx, y, sx + sw, y + hh, c0, c1); head = sx + sw;
      const lo = Math.max(sx + 4, sweep - 14), hi = Math.min(sx + sw - 4, sweep + 14);
      if (hi - lo > 3) tint(ctx, lo, y + hh * 0.16, hi, y + hh * 0.42, [255, 255, 255], 0.45, hh * 0.15);
    }
  });
  const hx = smooth("h" + key, head, tt);
  if (style === "neon" && pulse > 0.35) flat(ctx, Math.round(hx / 4) * 4 - 2, y - 2, Math.round(hx / 4) * 4 + 2, y + hh + 2, [255, 255, 255]); // a square blinking marker at the head
  return [hx, y - 0.5];
}
function plasma(ctx: Ctx, xa: number, y: number, xb: number, hh: number, hx: number, tt: number) {
  cap(ctx, xa, y, xb, y + hh, [34, 34, 48], [22, 22, 32]);
  const w = hx - xa; if (w < hh * 0.6) return;
  ctx.save(); ctx.beginPath(); ctx.roundRect(xa, y, w, hh, hh / 2); ctx.clip();
  for (let px = 0; px < w; px += 2) { ctx.fillStyle = rgb(stopsAt(FLOW, (((px / (xb - xa)) * 0.9 + tt * 0.14) % 1 + 1) % 1)); ctx.fillRect(xa + px, y, 2.2, hh); }
  const g = ctx.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, "rgba(255,255,255,0.28)"); g.addColorStop(0.4, "rgba(255,255,255,0.1)"); g.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = g; ctx.fillRect(xa, y, w, hh); ctx.restore();
  for (let i = 0; i < 9; i++) { const ph = (tt * 0.35 + i * 0.137) % 1, bx = xa + 8 + ((i * 53) % Math.max(1, Math.floor(w - 14))), by = y + hh - 2 - ph * (hh - 3), r = 1 + (i % 3) * 0.6; tint(ctx, bx - r, by - r, bx + r, by + r, [255, 255, 255], 0.4 * (1 - ph), r); }
  orb(ctx, hx, y + hh / 2, hh * 0.22, stopsAt(FLOW, (tt * 0.14 + 0.9) % 1), 0.5);
}
export function drawClaude(ctx: Ctx, h: Helpers, w: Record<string, unknown>, x0: number, y0: number, x1: number, y1: number) {
  const str = (k: string) => String(w[k] ?? ""), num = (k: string) => Number(w[k] ?? 0);
  const big = num("w") >= 4 || w.w === undefined, tall = (w.h === undefined ? 2 : num("h")) >= 2, tt = performance.now() / 1000;
  const state = str("state") || "none", working = state === "working", look = str("mascot") || "pip", style = str("bar") || "neon";
  const age = w.done_at ? Date.now() / 1000 - Number(w.done_at) : 99, cheer = state === "idle" && age >= 0 && age < 4.2;
  const skey = cheer ? "done" : state === "working" && Math.round(num("asking")) ? "ask" : state, sc = STATE_COL[skey] ?? STATE_COL.none;
  let word = ({ working: "WORKING", idle: "IDLE", none: "NO SESSION", done: "DONE", ask: "QUESTION" } as Record<string, string>)[skey];
  if (working && w.elapsed) word += " · " + str("elapsed");
  const doneN = w.todo_done as number | undefined, total = w.todo_total as number | undefined, states = w.todo_live === false ? "" : str("todo_states");
  const steps = Math.round(num("steps")), agents = Math.min(4, Math.round(num("agents"))), act = str("activity") || "think";
  const action = str("action") || (state === "idle" ? "Waiting for your next message" : ""), reply = str("reply");
  // the first thing to read is what is happening right now; the session's name is only a small label
  const prim = ({ ask: "Claude has a question", done: "Finished", none: "No session" } as Record<string, string>)[skey] || action || (working ? "Working" : "");
  const count = states ? `${doneN}/${total}` : steps ? `${steps} step${steps !== 1 ? "s" : ""}` : "";
  let items: string[], prog: number;
  if (states) { items = states.split(""); prog = (items.filter((c) => c === "c").length + 0.5 * items.filter((c) => c === "a").length) / items.length; }
  else { items = Array<string>(Math.min(Math.max(steps, 1), 24)).fill("c"); items[items.length - 1] = "a"; prog = steps ? 1 - 1 / (1 + steps / 9) : 0.03; }
  if (state === "idle" && states) prog = items.filter((c) => c === "c").length / items.length;
  const key = [w.col, w.row, w.w, w.h].join(","), kind = cheer ? "done" : state === "idle" || state === "none" ? "sleep" : KIND_OF[act] ?? "thinker";
  const wide = big && !tall, mode = str("mode") || "code";
  let ic: number, ty: number, ah: number, bh: number, ky: number;
  if (big && tall) { ic = 20; ty = 12; ah = 20; bh = 16; ky = 0.84; } else if (wide) { ic = 20; ty = 12; ah = 12; bh = 10; ky = 0.42; } else { ic = 20; ty = 14; ah = 11; bh = 12; ky = 0.62; }
  chip(ctx, h, x0 + 12, y0 + ty - ic / 2, ic, str("app") || "desktop", str("host") || "local", mode);
  let pw = big ? statePill(ctx, h, x1 - 12, y0 + ty, word, sc, 11) : 0;
  const tx = x0 + 12 + ic + 9;
  if (big && tall) { // the session's name and where it runs: small and quiet
    const tag = (mode === "cowork" ? "COWORK" : mode === "chat" ? "CHAT" : "CODE") + " · " + (({ desktop: "DESKTOP", code: "VS CODE", terminal: "TERMINAL" } as Record<string, string>)[str("app")] ?? ""), tw = h.width(ctx, tag, 9, "mono", true) + 12;
    h.rrect(ctx, x1 - 12 - pw - 8 - tw, y0 + ty - 8, x1 - 12 - pw - 8, y0 + ty + 8, 8, "#1a1c28");
    h.text(ctx, x1 - 12 - pw - 8 - tw / 2, y0 + ty, tag, 9, "#969ebe", "mono", true, "center");
    pw += tw + 8;
    h.text(ctx, tx, y0 + ty, h.clip(ctx, str("title"), 11, x1 - 12 - pw - 10 - tx), 11, "#7880a0", "label", true, "left");
  } else { // smaller sizes: what is happening replaces the name on the top row
    const ps = wide ? 15 : 14;
    h.text(ctx, tx, y0 + ty, h.clip(ctx, prim, ps, x1 - 12 - pw - 10 - tx), ps, "#eeeef6", "label", true, "left");
  }
  let ay: number | null, by: number;
  if (big && tall) { ay = y0 + 42; by = y0 + 83; } else if (wide) { ay = null; by = y0 + 35; } else { ay = y0 + 46; by = y0 + 80; }
  const xa = x0 + 14, xb = x1 - 14;
  if (ay !== null) {
    const right = working || (states && state === "idle") ? count : "", rw = right ? h.width(ctx, right, 12, "mono", true) + 10 : 0;
    const gx = working ? 18 : 0;
    const step = working ? str("step_elapsed") : "", sw = step ? h.width(ctx, step, 11, "mono", false) + 8 : 0;
    const [line, lsize, lrole] = big && tall ? [prim, ah, "label"] as const : [word.split(" · ")[0], 10, "mono"] as const; // narrow: the state word under the top row
    const aw = Math.min(h.width(ctx, line, lsize, lrole, true), xb - xa - rw - gx - sw);
    h.text(ctx, xa + gx, ay, h.clip(ctx, line, lsize, xb - xa - rw - gx - sw), lsize, lrole === "label" ? "#eeeef6" : rgb(sc), lrole, true, "left");
    if (step) h.text(ctx, xa + gx + aw + 8, ay, step, 11, "#969ebe", "mono", false, "left");
    if (right) h.text(ctx, xb, ay, right, 12, rgb(sc), "mono", true, "right");
  }
  if (working || cheer) {
    if (cheer && !working) { items = items.map(() => "c"); prog = 1; }
    const [hx, foot] = claudeBar(ctx, style, xa, by, xb, bh, items, prog, tt, key);
    if (ay !== null) glyph(ctx, xa, ay, act, tt, sc);
    if ((style === "neon" || style === "plasma" || style === "classic") && hx - xa > 40) [20, 44, 72].forEach((off, j) => { if (Math.sin(tt * 3 + j * 2.1) > 0.15 && hx - off > xa + 4) h.sparkle(Math.round(hx - off - 6), Math.round(by - 8 - j * 3), "#ffd65a"); });
    const k = ky, ck = k * 0.62, step = U * ck * 0.42;
    for (let j = 0; j < agents; j++) mascot(ctx, h, look, CREW[j], xb - 24 - j * step - 4, foot, ck, tt, { phase: j * 0.3 });
    const mx = Math.max(xa + 10 * k, Math.min(hx - 2, xb - 22 * k - (agents ? agents * step + 8 : 0)));
    mascot(ctx, h, look, kind, mx, foot, k, tt, { jump: cheer ? Math.abs(Math.sin(age * 7)) * 10 * Math.max(0, 1 - age / 4) : 0, moving: working });
  } else {
    mascot(ctx, h, look, "sleep", x1 - 14 - 22 * ky * 0.6, y1 - 2, big && tall ? ky * 0.95 : ky, tt, { moving: false });
    if (big && tall) h.replyBlock(reply, num("scroll"), 12, xa, y0 + 66, 13, 3, xb - xa - 70, xb - 70);
    else if (wide) h.text(ctx, xa, y0 + 36, h.clip(ctx, reply, 12, xb - xa - 56), 12, "#969ebe", "label", false, "left");
    else h.replyBlock(reply, num("scroll"), 11, xa, y0 + 62, 13, 2, xb - xa - 36, xb - 40);
  }
  if (cheer) h.confetti(x0, y0, x1, y1, age);
}

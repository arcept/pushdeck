// The Claude question alert and the usage-limit alert, mirroring daemon/push_daemon/display/render_ask.py: change both together.
// Questions are answered in the Claude app, never on the Push.
import type { Helpers } from "./claude";

type Ctx = CanvasRenderingContext2D;
type RGB = [number, number, number];
const INK = "#eeeef6", INK2 = "#aab0cc", INK3 = "#787e9c";
const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(v)).join(",")})`;
const mixc = (a: number[], b: number[], t: number) => { const k = Math.max(0, Math.min(1, t)); return a.map((v, i) => v + (b[i] - v) * k); };

function wrap(ctx: Ctx, h: Helpers, text: string, size: number, maxw: number, role: "label" | "mono", bold = false): string[] {
  const lines: string[] = []; let cur = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (h.width(ctx, word, size, role, bold) > maxw && word.length > 1) {
      let k = word.length; while (k > 1 && h.width(ctx, word.slice(0, k), size, role, bold) > maxw) k--;
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(word.slice(0, k)); word = word.slice(k);
    }
    const t = (cur + " " + word).trim();
    if (cur && h.width(ctx, t, size, role, bold) > maxw) { lines.push(cur); cur = word; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
export function linesN(ctx: Ctx, h: Helpers, text: string, size: number, maxw: number, n: number, role: "label" | "mono", bold = false): string[] {
  const lines = wrap(ctx, h, text, size, maxw, role, bold);
  if (lines.length <= n) return lines;
  let last = lines[n - 1];
  while (last.length > 1 && h.width(ctx, last + "...", size, role, bold) > maxw) last = last.slice(0, -1);
  return [...lines.slice(0, n - 1), last.trimEnd() + "..."];
}


/** Where the Claude widget was while a question waits: 'Claude is asking', its first question, a pointer to the Answer button. */
const QMARK = ["01110", "10001", "00001", "00110", "00100", "00000", "00100"];
const PAL: RGB[] = [[255, 200, 60], [255, 110, 160], [110, 230, 130], [106, 167, 255], [255, 140, 90]];
const ORANGE: RGB = [255, 122, 64], GOLD: RGB = [255, 200, 60];
function pix(ctx: Ctx, rows: string[], x: number, y: number, k: number, color: string) {
  ctx.fillStyle = color;
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "1") ctx.fillRect(Math.round(x + i * k), Math.round(y + j * k), Math.max(1, Math.round(k)), Math.max(1, Math.round(k))); }));
}

/** The 'Claude is asking' alert, over the whole display (w.away) or the half the Claude widget had: a giant pixel ? in rolling bands of colour,
 * confetti, the question beside it. Mirrors w_ask_banner in render_ask.py. */
export function drawAskBanner(ctx: Ctx, h: Helpers, w: Record<string, unknown>, x0: number, _y0: number, x1: number, _y1: number) {
  const t = performance.now() / 1000, pulse = 0.5 + 0.5 * Math.sin(t * 4), wide = !!w.away, y0 = 10, y1 = 150, k = 11, shift = Math.floor(t * 4);
  QMARK.forEach((row, j) => pix(ctx, [row], x0 + 36, y0 + 18 + j * k, k, rgb(PAL[(j + shift) % 5])));
  h.confetti(x0 + 120, y0, x1 - 8, y1, (t * 0.9) % 3);
  const tx = x0 + 130, size = wide ? 19 : 14, pitch = wide ? 24 : 18;
  h.text(ctx, tx, y0 + 20, "Question for you", wide ? 24 : 20, rgb(GOLD), "label", true, "left");
  linesN(ctx, h, String(w.question ?? ""), size, x1 - tx - 28, 3, "label", true).forEach((ln, i) => h.text(ctx, tx, y0 + 52 + i * pitch, ln, size, INK, "label", true, "left"));
  if (wide) h.text(ctx, tx, y1 - 14, `from Claude  ·  ${Math.round(Number(w.n) || 1)} to answer`, 11, INK3, "mono", true, "left");
  if (w.away) { // two pills over the last two lower buttons: Dismiss, Open Claude
    const by0 = y1 - 38, by1 = y1 - 4;
    h.rrect(ctx, x1 - 232, by0, x1 - 128, by1, 17, "#2e2e38");
    h.text(ctx, x1 - 180, (by0 + by1) / 2, "Dismiss", 15, INK2, "label", true, "center");
    h.rrect(ctx, x1 - 112, by0, x1 - 8, by1, 17, rgb(mixc(ORANGE, [255, 175, 120], pulse * 0.5)));
    h.text(ctx, x1 - 60, (by0 + by1) / 2, "Open Claude", 14, "#240e04", "label", true, "center");
  } else h.text(ctx, x1 - 28, y1 - 22, "Answer it in the Claude app", 11, INK3, "mono", false, "right");
}

/** A usage window crossed a threshold: the whole display in the error colour. */
/** The two limits' icons, solid shapes inside the badge: a clock face for the 5-hour session, a calendar for the week. Mirrors limit_icon in render_ask.py. */
function limitIcon(ctx: Ctx, h: Helpers, name: unknown, cx: number, cy: number, ink: string, col: number[]) {
  ctx.save(); ctx.strokeStyle = rgb(col); ctx.fillStyle = ink; ctx.lineJoin = "round";
  if (name === "calendar") {
    h.rrect(ctx, cx - 24, cy - 20, cx + 24, cy + 24, 7, ink);
    ctx.save(); ctx.beginPath(); ctx.roundRect(cx - 24, cy - 20, 48, 12, [7, 7, 0, 0]); ctx.fillStyle = rgb(mixc([12, 8, 8], col, 0.5)); ctx.fill(); ctx.restore();
    ctx.strokeStyle = ink; ctx.lineWidth = 5;
    for (const x of [cx - 11, cx + 11]) { ctx.beginPath(); ctx.moveTo(x, cy - 27); ctx.lineTo(x, cy - 14); ctx.stroke(); }
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) h.rrect(ctx, cx - 13 + c * 13 - 3, cy + 2 + r * 12 - 3, cx - 13 + c * 13 + 3, cy + 2 + r * 12 + 3, 1.5, rgb(col));
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy); ctx.lineTo(cx + 12, cy + 8); ctx.stroke();
  }
  ctx.restore();
}

/** A usage window climbed past a level: the whole display, on the plain black. The colour (set by the daemon) runs from the limit's own towards red
 * as usage rises; the badge and the big label say which limit it is. No outlines, no tinted background. Mirrors w_limit in render_ask.py. */
export function drawLimit(ctx: Ctx, h: Helpers, w: Record<string, unknown>) {
  const col = ((w.color as number[]) ?? [255, 77, 77]).map(Number), pct = Math.max(0, Math.min(100, Math.round(Number(w.pct) || 0)));
  h.rrect(ctx, 28, 26, 112, 110, 18, rgb(col));
  limitIcon(ctx, h, w.icon, 70, 68, rgb(mixc([12, 8, 8], col, 0.12)), col);
  h.text(ctx, 134, 38, `${w.name ?? "Claude"}  ·  Usage Alert`, 12, INK3, "mono", true, "left");
  h.text(ctx, 134, 70, `${w.window ?? ""} Limit`, 36, rgb(col), "label", true, "left");
  h.text(ctx, 134, 100, String(w.msg ?? ""), 15, INK2, "label", false, "left");
  h.text(ctx, 932, 66, `${pct}%`, 76, "#ffffff", "label", true, "right");
  const x0 = 28, x1 = 932, y0 = 118, y1 = 132;
  h.rrect(ctx, x0, y0, x1, y1, 7, "#222228");
  h.rrect(ctx, x0, y0, x0 + (x1 - x0) * pct / 100, y1, 7, rgb(col));
  for (const mark of [70, 80, 90]) { const x = x0 + (x1 - x0) * mark / 100; ctx.fillStyle = "#000"; ctx.fillRect(x - 1, y0, 2, y1 - y0); }
  if (w.resets) h.text(ctx, 28, 145, `Resets in ${String(w.resets)}`, 11, INK3, "mono", true, "left");
  h.text(ctx, 932, 145, `Press Any Button  ·  Closes in ${Number(w.closes) || 0}s`, 10, INK3, "mono", false, "right");
}

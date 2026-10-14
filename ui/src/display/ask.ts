// The full-screen question card, mirroring daemon/push_daemon/display/render_ask.py: change both together.
// Top strip: the 8 upper buttons' labels. Then the question number and the question. Under it the options as tiles (up to four), each over its
// share of the 8 lower buttons. Modes: pick, read (the full text of one option), dictate (the Other answer is being spoken), sent.
import type { Helpers } from "./claude";

type Ctx = CanvasRenderingContext2D;
type RGB = [number, number, number];
const INK = "#eeeef6", INK2 = "#aab0cc", INK3 = "#787e9c", GOOD = "#6ee682";
const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(v)).join(",")})`;
const mixc = (a: number[], b: number[], t: number) => { const k = Math.max(0, Math.min(1, t)); return a.map((v, i) => v + (b[i] - v) * k); };
const TILE: RGB = [22, 24, 34];
const hexRgb = (h: string): RGB => { const n = parseInt((h || "#d97757").replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

type Btn = { label?: string; on?: boolean; color?: RGB; quiet?: boolean };
type Tile = { x0: number; x1: number; label: string; desc: string; sel: boolean; hi: boolean; other: boolean; text: string };

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

export function drawAsk(ctx: Ctx, h: Helpers, w: Record<string, unknown>, accent: string) {
  const acc = hexRgb(accent), str = (k: string) => String(w[k] ?? ""), mode = str("mode") || "pick", ac = rgb(acc);
  const buttons = (w.buttons as Btn[]) || [];
  buttons.forEach((b, i) => {
    if (!b || !b.label || b.on === false) return;
    const c = (b.color ?? acc) as RGB;
    h.text(ctx, i * 120 + 60, 13, b.label, 11, INK, "mono", true, "center");
    h.rrect(ctx, i * 120 + 8, 21.5, i * 120 + 112, 23, 0.75, rgb(c));
  });
  if (mode === "dictate") {
    const t = performance.now() / 1000, pulse = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.fillStyle = rgb(mixc([60, 20, 20], [255, 90, 90], 0.4 + 0.6 * pulse)); ctx.beginPath(); ctx.arc(60, 84, 14, 0, Math.PI * 2); ctx.fill();
    h.text(ctx, 100, 76, str("text") || "Listening", 28, INK, "label", true, "left");
    h.text(ctx, 100, 104, str("sub"), 12, INK3, "mono", false, "left");
    if (w.heard) linesN(ctx, h, str("heard"), 13, 900, 2, "label").forEach((ln, i) => h.text(ctx, 100, 128 + i * 16, ln, 13, ac, "label", false, "left"));
    return;
  }
  if (mode === "sent") { h.text(ctx, 480, 84, str("text") || "Sent to Claude", 30, GOOD, "label", true, "center"); h.text(ctx, 480, 116, str("sub"), 12, INK3, "mono", false, "center"); return; }
  if (mode === "read") {
    const r = (w.read as { label: string; body: string }) || { label: "", body: "" };
    h.text(ctx, 14, 38, "EXPANDED  ·  turn the encoder to scroll", 11, ac, "mono", true, "left");
    type Row = [string, number, string, boolean, "label" | "mono", number];
    const rows: Row[] = [...wrap(ctx, h, str("question"), 12.5, 920, "label").map((l): Row => [l, 12.5, INK3, false, "label", 15]), ["", 6, INK, false, "label", 8] as Row,
      ...wrap(ctx, h, r.label, 15, 920, "label").map((l): Row => [l, 15, INK, true, "label", 19]), ...wrap(ctx, h, r.body, 12, 920, "mono").map((l): Row => [l, 12, INK2, false, "mono", 15])];
    const top = Math.max(0, Math.min(Math.floor(Number(w.scroll) || 0), Math.max(0, rows.length - 1)));
    let y = 58, shown = 0;
    for (let i = top; i < rows.length; i++) { const [ln, size, color, bold, role, pitch] = rows[i]; if (y + pitch / 2 > 158) break; if (ln) h.text(ctx, 14, y, ln, size, color, role, bold, "left"); y += pitch; shown = i; }
    if (top > 0) h.text(ctx, 948, 50, "^", 11, INK2, "mono", true, "center");
    if (shown < rows.length - 1) h.text(ctx, 948, 150, "v", 11, INK2, "mono", true, "center");
    return;
  }
  h.text(ctx, 14, 38, `Q ${w.qi}/${w.qn}` + (w.header ? `  ·  ${str("header").toUpperCase()}` : ""), 11, ac, "mono", true, "left");
  const dots = str("dots"); let dx = 946;
  for (let i = dots.length - 1; i >= 0; i--) {
    const cur = i + 1 === Number(w.qi), on = dots[i] === "a";
    ctx.beginPath(); ctx.arc(dx, 38, 4, 0, Math.PI * 2);
    if (on) { ctx.fillStyle = GOOD; ctx.fill(); } else { ctx.strokeStyle = INK3; ctx.lineWidth = 2; ctx.stroke(); }
    if (cur) { ctx.beginPath(); ctx.arc(dx, 38, 7, 0, Math.PI * 2); ctx.strokeStyle = ac; ctx.lineWidth = 2; ctx.stroke(); }
    dx -= 18;
  }
  h.text(ctx, dx - 4, 38, (w.multi ? "PICK SEVERAL" : "PICK ONE") + (Number(w.pages) > 1 ? `  ·  PAGE ${Number(w.page) + 1}/${w.pages}` : ""), 11, INK3, "mono", true, "right");
  const ql = wrap(ctx, h, str("question"), 15, 880, "label"), long = ql.length > 2, qsize = long ? 12.5 : 15, pitch = long ? 15 : 19, top = long ? 98 : 88;
  linesN(ctx, h, str("question"), qsize, 880, long ? 3 : 2, "label", true).forEach((ln, i) => h.text(ctx, 14, 56 + i * pitch, ln, qsize, INK, "label", true, "left"));
  const tiles = (w.tiles as Tile[]) || [], bot = 157;
  tiles.forEach((t) => {
    const x0 = t.x0 + 4, x1 = t.x1 - 4;
    h.rrect(ctx, x0, top, x1, bot, 8, rgb(t.sel ? mixc(TILE, acc, 0.24) : TILE), t.sel ? ac : t.hi ? "#c8cde6" : undefined, t.sel || t.hi ? 2 : 1);
    const nx = x0 - 4 + 60;
    h.rrect(ctx, nx - 14, bot - 1, nx + 14, bot + 2, 1.5, t.sel ? ac : t.hi ? "#ffffff" : INK3);
    const mx = x0 + 15, my = top + 15;
    ctx.lineWidth = 1.5;
    if (w.multi) {
      h.rrect(ctx, mx - 6, my - 6, mx + 6, my + 6, 3, t.sel ? ac : undefined, t.sel ? ac : INK3, 1.4);
      if (t.sel) { ctx.strokeStyle = "#101018"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(mx - 3, my); ctx.lineTo(mx - 1, my + 2.5); ctx.lineTo(mx + 3.5, my - 3); ctx.stroke(); }
    } else {
      ctx.strokeStyle = t.sel ? ac : INK3; ctx.beginPath(); ctx.arc(mx, my, 5.2, 0, Math.PI * 2); ctx.stroke();
      if (t.sel) { ctx.fillStyle = ac; ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill(); }
    }
    const tx = x0 + 30, mw = x1 - x0 - 38, lab = linesN(ctx, h, t.label, 13, mw, x1 - x0 < 600 ? 2 : 1, "label", true);
    lab.forEach((ln, j) => h.text(ctx, tx, top + 15 + j * 15, ln, 13, t.other ? ac : INK, "label", true, "left"));
    const dy = top + 15 + lab.length * 15 + 3, room = Math.floor((bot - 5 - dy) / 12);
    linesN(ctx, h, t.text || t.desc, 10.5, x1 - x0 - 18, Math.max(1, room), "mono").forEach((ln, j) => h.text(ctx, x0 + 10, dy + j * 12 + 2, ln, 10.5, t.sel ? INK2 : INK3, "mono", false, "left"));
  });
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
    h.rrect(ctx, x1 - 232, by0, x1 - 128, by1, 17, undefined, INK3, 2);
    h.text(ctx, x1 - 180, (by0 + by1) / 2, "Dismiss", 15, INK2, "label", true, "center");
    h.rrect(ctx, x1 - 112, by0, x1 - 8, by1, 17, rgb(mixc(ORANGE, [255, 175, 120], pulse * 0.5)));
    h.text(ctx, x1 - 60, (by0 + by1) / 2, "Open Claude", 14, "#240e04", "label", true, "center");
  } else h.text(ctx, x1 - 28, y1 - 22, "Answer it in the Claude app", 11, INK3, "mono", false, "right");
}

/** A usage window crossed a threshold: the whole display in the error colour. */
export function drawLimit(ctx: Ctx, h: Helpers, w: Record<string, unknown>) {
  const red = "#ff4d4d", pct = Math.max(0, Math.min(100, Math.round(Number(w.pct) || 0))), blink = Number(w.level_blink) || 0;
  h.rrect(ctx, 4, 6, 956, 154, 14, "#3c080c", rgb(mixc([60, 8, 12], [255, 77, 77], 0.55 + 0.45 * blink)), 3);
  h.text(ctx, 36, 40, `${w.name ?? "CLAUDE"}  ·  ${w.window ?? ""} LIMIT`, 20, red, "label", true, "left");
  h.text(ctx, 36, 74, pct < 95 ? "Almost out: slow down or switch tasks" : "About to hit the limit", 14, INK2, "label", false, "left");
  h.text(ctx, 924, 62, `${pct}%`, 64, "#ffffff", "label", true, "right");
  h.rrect(ctx, 36, 112, 924, 130, 9, "#1e0608");
  h.rrect(ctx, 36, 112, 36 + (924 - 36) * pct / 100, 130, 9, red);
  if (w.resets) h.text(ctx, 36, 144, `RESETS IN ${String(w.resets).toUpperCase()}`, 11, INK3, "mono", true, "left");
  h.text(ctx, 924, 144, "PRESS ANY BUTTON TO DISMISS", 10, INK3, "mono", false, "right");
}

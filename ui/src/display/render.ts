// Browser renderer for the display scene spec (mirrors daemon/push_daemon/display/render.py).
// Tokens come from tokens.json, generated from the daemon's tokens.py: one source of truth.
import tokens from "./tokens.json";
import { buddy, drawClaude, type Helpers } from "./claude";
import { drawAsk, drawAskBanner, drawLimit, linesN } from "./ask";

export type Icons = Record<string, { p?: number[][]; c?: number[]; closed?: boolean; fill?: boolean }[]>;
export type Zone = { label?: string; icon?: string | null; keep_case?: boolean; bar?: boolean; bar_color?: string; icon_color?: string; lit?: boolean; dim?: boolean };
export type Widget = { type: string; col?: number; span?: number; [k: string]: unknown };
export type Toast = { label: string; icon: string; value: number; text: string };
export type Spec = { accent: string; zones: Record<string, Zone>; active: string[]; widgets: Widget[]; toast?: Toast | null; no_zones?: boolean; view?: string; glow?: Record<string, number>; pill?: { text: string; icon?: string; value?: number; vtext?: string; a?: number } };
export type Scene = { kind: string; spec: Spec };

const T = tokens, G = T.grid, C = T.color as Record<string, string>;
export const W = T.canvas.w, H = T.canvas.h, SCALE = 2; // internal canvas is 2x for crisp edges
const LABEL = "Quicksand, 'Helvetica Neue', sans-serif", MONO = "'IBM Plex Mono', ui-monospace, monospace";
export const loadFonts = () => Promise.all(["700 15px Quicksand", "500 15px Quicksand", "400 15px 'IBM Plex Mono'", "700 15px 'IBM Plex Mono'"].map((x) => document.fonts.load(x)));
const col = (n: string) => C[n] ?? n;
const font = (px: number, role: "label" | "mono", bold: boolean) => `${bold ? 700 : role === "mono" ? 400 : 500} ${px}px ${role === "label" ? LABEL : MONO}`;

type Ctx = CanvasRenderingContext2D;

function icon(ctx: Ctx, icons: Icons, name: string, cx: number, cy: number, size: number, color: string, width = 2) {
  const x0 = cx - size / 2, y0 = cy - size / 2;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const sh of icons[name] ?? []) {
    ctx.beginPath();
    if (sh.c) ctx.arc(x0 + sh.c[0] * size, y0 + sh.c[1] * size, sh.c[2] * size, 0, Math.PI * 2);
    else if (sh.p) { sh.p.forEach(([x, y], i) => (i ? ctx.lineTo(x0 + x * size, y0 + y * size) : ctx.moveTo(x0 + x * size, y0 + y * size))); if (sh.closed) ctx.closePath(); }
    sh.fill ? ctx.fill() : ctx.stroke();
  }
}

function text(ctx: Ctx, x: number, y: number, s: string, size: number, color: string, role: "label" | "mono" = "label", bold = true, align: CanvasTextAlign = "center") {
  ctx.font = font(size, role, bold); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(s, x, y);
}
const width = (ctx: Ctx, s: string, size: number, role: "label" | "mono" = "mono", bold = true) => { ctx.font = font(size, role, bold); return ctx.measureText(s).width; };
function rrect(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, fill?: string, stroke?: string, lw = 1) {
  ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function fit(ctx: Ctx, s: string, hasIcon: boolean, maxw: number, bold = false) {
  // 14 px with its icon when there is room; else no icon and a smaller size (13 to 9) so the whole label shows. Never "...".
  if (hasIcon && width(ctx, s, 14, "mono", bold) + 20 <= maxw) return { s, icon: true, size: 14 };
  for (const size of [14, 13, 12, 11, 10, 9]) if (width(ctx, s, size, "mono", bold) <= maxw) return { s, icon: false, size };
  while (s.length > 1 && width(ctx, s, 9, "mono", bold) > maxw) s = s.slice(0, -1);
  return { s, icon: false, size: 9 };
}

// Each button's label sits in a 24 px strip; the open / active / pressed one gets a bar along its bottom edge instead of a fill.
function zones(ctx: Ctx, icons: Icons, spec: Spec, accent: string) {
  const active = new Set(spec.active);
  for (const top of [true, false]) for (let i = 0; i < 8; i++) {
    const cid = `btn-${top ? "upper" : "lower"}-${i + 1}`, e = spec.zones[cid] ?? {};
    const x0 = i * G.col_w + (G.col_w - G.zone_w) / 2, y0 = top ? G.zone_margin : H - G.zone_margin - G.zone_h;
    const cx = x0 + G.zone_w / 2, cy = y0 + 10;
    let s = (e.label ?? "").trim(); if (s && !e.keep_case) s = s.toUpperCase();
    if (!s && !e.icon) continue; // nothing assigned: nothing drawn
    const glow = spec.glow?.[cid] ?? 0;
    if (glow) { // a press lights the strip from its bar upward; on release it fades
      const by = y0 + G.zone_h - 2.5, g = ctx.createLinearGradient(0, by, 0, by - 14), gc = hexRgb(e.bar_color || accent);
      g.addColorStop(0, `rgba(${gc.join(",")},${glow * 0.32})`); g.addColorStop(1, `rgba(${gc.join(",")},0)`);
      ctx.fillStyle = g; ctx.fillRect(x0, by - 14, G.zone_w, 14);
    }
    const on = active.has(cid) || !!e.bar, lit = on || !!e.lit, color = e.dim ? col("ink4") : lit ? col("ink") : col("ink3"); // pressed / open: bold + bar; lit (saved, shuffle on): bold, no bar
    if (s) {
      const r = fit(ctx, s, !!e.icon, G.zone_w - 4, lit);
      if (r.icon && e.icon) {
        const sx = cx - (r.size + 6 + width(ctx, r.s, r.size, "mono", lit)) / 2;
        icon(ctx, icons, e.icon, sx + r.size / 2, cy, r.size, e.icon_color || color); text(ctx, sx + r.size + 6, cy, r.s, r.size, color, "mono", lit, "left");
      } else text(ctx, cx, cy, r.s, r.size, color, "mono", lit, "center");
    } else icon(ctx, icons, e.icon!, cx, cy + 1, 16, e.icon_color || color);
    if (on) rrect(ctx, x0, y0 + G.zone_h - 2.5, x0 + G.zone_w, y0 + G.zone_h - 1, 0.75, e.bar_color || accent);
  }
}

// ---- little pixel workers of the Claude session widget (mirror Painter.critter / pixels / sparkle in render.py) ----
const PROP_PAL: Record<string, string> = { w: "#e8e8ee", g: "#9a9aa6", y: "#f5c542", p: "#ff8fb1", e: "#7ed37f" };
function pixels(ctx: Ctx, rows: string[], x: number, y: number, k: number, pal: Record<string, string>) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => { const c = pal[ch]; if (c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x + i * k), Math.round(y + j * k), Math.round(x + (i + 1) * k) - Math.round(x + i * k), Math.round(y + (j + 1) * k) - Math.round(y + j * k)); } }));
}
function critter(ctx: Ctx, tt: number, x: number, bottom: number, k: number, body: string, activity = "", phase = 0, o: { sleep?: boolean; jump?: number; slow?: boolean } = {}) {
  const sp = T.sprites, rb = hexRgb(body), pal = { o: body, c: body, l: rgbStr(rb, 0.62), k: "#1a1a1f" };
  bottom -= o.jump ?? 0;
  if (o.sleep) { // sits with its eyes low, breathing, z's floating up
    const top = bottom - 7 * k - (Math.floor(tt * 1.2) % 2 ? 1 : 0);
    pixels(ctx, sp.pip.sleep, x, top, k, pal);
    for (const j of [0, 1]) { const ph = (tt * 0.5 + j * 0.5) % 1; ctx.globalAlpha = 1 - ph; text(ctx, x + 12 * k + 2 + ph * 8, top - 2 - ph * 12, "z", 9 + 3 * j, col("ink2"), "mono", true, "left"); ctx.globalAlpha = 1; }
    return;
  }
  const fr = Math.floor(tt * (o.slow ? 2 : 4) + phase) % 2, top = bottom - 8 * k - (fr ? k : 0);
  pixels(ctx, sp.pip.frames[fr], x, top, k, pal);
  const prop = (sp.props as Record<string, string[]>)[activity];
  if (prop) pixels(ctx, prop, x + 12 * k + 1, top - (Math.floor(tt * 3 + phase) % 2 ? k : 0), k, PROP_PAL);
}
function confetti(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, age: number) {
  const cols = [[217, 119, 87], [245, 197, 66], [126, 211, 127], [255, 143, 177], [106, 167, 255]], fade = Math.max(0, 1 - Math.max(0, age - 3.2)), wd = Math.floor(x1 - x0 - 16), ht = Math.floor(y1 - y0);
  for (let i = 0; i < 24; i++) { ctx.fillStyle = rgbStr(cols[i % 5], fade); ctx.fillRect(Math.round(x0 + 8 + (i * 47) % wd), Math.round(y0 + (age * 55 + i * 29) % ht), 3, 3); }
}
function mood(ctx: Ctx, h: Helpers, look: string, x: number, bottom: number, pct: number | null, color: string, k: number) { // the usage widgets' mascot: its mood follows how much of the limit is used
  buddy(ctx, h, look, pct == null ? "sleep" : pct >= 85 ? "bad" : pct >= 60 ? "warn" : "good", x, bottom, k, { body: color });
}
function sparkle(ctx: Ctx, cx: number, cy: number, c: string) {
  ctx.fillStyle = c;
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillRect(cx + dx * 2, cy + dy * 2, 2, 2);
}

function claudeHelpers(ctx: Ctx, icons: Icons): Helpers {
  return {
    text, width, clip, rrect,
    replyBlock: (str_, scroll, size, x, yFirst, pitch, n, maxw, xr) => replyBlock(ctx, icons, str_, scroll, size, x, yFirst, pitch, n, maxw, xr),
    oldCritter: (x, bottom, k, body, activity, phase, o) => critter(ctx, performance.now() / 1000, x, bottom, k, body, activity, phase, o),
    sparkle: (cx, cy, c) => sparkle(ctx, cx, cy, c),
    confetti: (a, b, c, d, age) => confetti(ctx, a, b, c, d, age),
  };
}

// ---- now playing (mirrors Painter.w_now_playing in the daemon's render.py) ----
const hexRgb = (h: string): number[] => { const n = parseInt((h || "#d97757").replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbStr = (c: number[], k = 1, lift = 0) => `rgb(${c.map((v) => Math.round(Math.min(255, v * k + (255 - v * k) * lift))).join(",")})`;
const artImgs = new Map<string, HTMLImageElement>();
const iconImgs = new Map<string, HTMLImageElement>();
function appIcon(key: string): HTMLImageElement | null {
  if (!key) return null;
  let im = iconImgs.get(key);
  if (!im) { im = new Image(); im.src = /^(\/|data:)/.test(key) ? key : `/api/media/icon/${key}`; iconImgs.set(key, im); }
  return im.complete && im.naturalWidth ? im : null;
}
const darkIcons = new WeakMap<HTMLImageElement, boolean>();
function isDarkIcon(im: HTMLImageElement): boolean { // all-black icons vanish on the black display: they get a white frame
  let v = darkIcons.get(im);
  if (v === undefined) {
    try {
      const c = document.createElement("canvas"); c.width = c.height = 16;
      const g = c.getContext("2d")!; g.drawImage(im, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data; let n = 0, sum = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { n++; sum += Math.max(d[i], d[i + 1], d[i + 2]); }
      v = n > 0 && sum / n < 70;
    } catch { v = false; }
    darkIcons.set(im, v);
  }
  return v;
}
function tomato(ctx: Ctx, cx: number, cy: number, r: number, color: string | null) { // a round body with a highlight and a green leaf; no colour = an empty outline (a round still to come)
  ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, Math.PI * 2);
  if (color === null) { ctx.strokeStyle = col("ink4"); ctx.lineWidth = 1; ctx.stroke(); return; }
  ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.beginPath(); ctx.ellipse(cx - r * 0.4, cy - r * 0.45, r * 0.2, r * 0.15, 0, 0, Math.PI * 2); ctx.fill();
  const top = cy - r * 0.85; ctx.fillStyle = "#3f9b4a"; ctx.strokeStyle = "#3f9b4a";
  for (const [dx, dy] of [[-0.75, -0.25], [0.75, -0.25], [-0.35, 0.15], [0.35, 0.15]]) { ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx + dx * r, top + dy * r - r * 0.1); ctx.lineTo(cx + dx * r * 0.45, top + r * 0.28); ctx.closePath(); ctx.fill(); }
  ctx.lineWidth = Math.max(1, r * 0.14); ctx.beginPath(); ctx.moveTo(cx, top - r * 0.35); ctx.lineTo(cx, top); ctx.stroke();
}
function artImage(key: string): HTMLImageElement | null {
  if (!key) return null;
  let im = artImgs.get(key);
  if (!im) { im = new Image(); im.src = /^(\/|data:|blob:)/.test(key) ? key : `/api/media/art/${key}`; artImgs.set(key, im); if (artImgs.size > 12) artImgs.delete(artImgs.keys().next().value as string); }
  return im.complete && im.naturalWidth ? im : null;
}
// A list row. Too long: "...". Once the selection has rested 3 s (scroll = seconds since) the name slides left to show its end, holds, snaps back.
function rowText(ctx: Ctx, x: number, cy: number, s: string, size: number, maxw: number, ink: string, bold: boolean, scroll?: number) {
  const tw = width(ctx, s, size, "label");
  if (scroll == null || tw <= maxw) { text(ctx, x, cy, clip(ctx, s, size, maxw), size, ink, "label", bold, "left"); return; }
  const over = tw - maxw, dur = over / 45, ph = scroll % (dur + 1.5 + 3), off = ph < dur + 1.5 ? over * Math.min(1, ph / dur) : 0;
  ctx.save(); ctx.beginPath(); ctx.rect(x, cy - 10, maxw, 20); ctx.clip(); text(ctx, x - off, cy, s, size, ink, "label", bold, "left"); ctx.restore();
}
function clip(ctx: Ctx, s: string, size: number, maxw: number) {
  if (width(ctx, s, size, "label") <= maxw) return s;
  while (s.length > 1 && width(ctx, s + "...", size, "label") > maxw) s = s.slice(0, -1);
  return s.trimEnd() + "...";
}
const mixc = (a: number[], b: number[], t: number) => { const k = Math.max(0, Math.min(1, t)); return a.map((v, i) => v + (b[i] - v) * k); };
function nowPlaying(ctx: Ctx, icons: Icons, w: Widget) {
  const idle = String(w.idle ?? ""), x0 = Number(w.col ?? 0) * G.col_w, x1 = x0 + Number(w.w ?? 4) * G.col_w, compact = Number(w.w ?? 4) < 4; // 4 x 2 on a half, or a compact 2 x 2
  const tint = hexRgb(String(w.tint || "#3d8bff")), tint2 = hexRgb(String(w.tint2 || "#1fd1c4"));
  // the player's interface (meter, progress bar) uses the source's colour; the visualizer keeps the artwork's
  const brand = w.brand ? hexRgb(String(w.brand)) : null, ui1 = brand ?? tint, ui2 = brand ? mixc(brand, [255, 255, 255], 0.28) : tint2;
  if (w.volume != null && !compact) {
    const vol = Number(w.volume), cx = x1 - 20, top = 66, bot = 106; // inside the player: it moves with it
    const glow = !!w.vol_glow, ink = glow ? col("ink") : col("ink3"), wd = glow ? 4 : 3;
    icon(ctx, icons, vol === 0 ? "mute" : "volume", cx, 52, 14, ink, 1.6);
    rrect(ctx, cx - wd, top, cx + wd, bot, wd, col("track"));
    rrect(ctx, cx - wd, bot - Math.max(3, (bot - top) * Math.max(0, Math.min(100, vol)) / 100), cx + wd, bot, wd, rgbStr(brand ?? mixc(tint2, tint, vol / 100)));
    text(ctx, cx, 116, String(Math.round(vol)), glow ? 12 : 11, ink, "mono", glow);
  }
  const art = artImage(String(w.art ?? ""));
  if (idle === "empty") { const cx = (x0 + x1) / 2; icon(ctx, icons, "music", cx, 50, 30, col("ink3")); text(ctx, cx, 86, "Nothing playing", compact ? 16 : 22, col("ink2")); if (!compact) text(ctx, cx, 110, String(w.hint ?? "Play something in Spotify or Chrome"), 13, col("ink3"), "mono", false); return; }
  const title = String(w.title ?? ""), artist = String(w.artist ?? ""), prog = Math.max(0, Math.min(1, Number(w.progress ?? 0)));
  // 2 x 2: artwork left, title and artist beside it, the bar and times under both; 4 x 2: the larger card with room for the volume meter
  const asz = compact ? 64 : 80, ax = x0 + (compact ? 12 : 14), ay = 40, tx0 = ax + asz + (compact ? 12 : 16), tw0 = x1 - (compact ? 12 : 44) - tx0;
  const tsize = compact ? 17 : 22, asize = compact ? 12 : 14, ty = compact ? 56 : 62, ay2 = compact ? 19 : 24, bsz = compact ? 16 : 22;
  const g = Number(w.glyph ?? 0); // paused: dimmed artwork with a pause glyph; just resumed: a play glyph that fades out
  if (art) { ctx.save(); ctx.beginPath(); ctx.roundRect(ax, ay, asz, asz, 8); ctx.clip(); ctx.drawImage(art, ax, ay, asz, asz); if (g > 0) { ctx.fillStyle = `rgba(0,0,0,${0.55 * g})`; ctx.fillRect(ax, ay, asz, asz); } ctx.restore(); }
  else rrect(ctx, ax, ay, ax + asz, ay + asz, 8, col("track"));
  if (g > 0) icon(ctx, icons, String(w.glyph_icon || "pause"), ax + asz / 2, ay + asz / 2, asz * 0.38, `rgb(${Math.round(255 * g)},${Math.round(255 * g)},${Math.round(255 * g)})`, 2.4);
  const srcIcon = appIcon(String(w.src_icon ?? ""));
  if (srcIcon) { const bs = bsz, bx = ax + asz - bs + 6, by = ay + asz - bs + 6; rrect(ctx, bx - 2, by - 2, bx + bs + 2, by + bs + 2, 7, "#000"); ctx.drawImage(srcIcon, bx, by, bs, bs); } // which app is playing
  const lx = w.liked ? tsize * 0.8 + 8 : 0; // already saved / liked: a filled heart in the source's colour before the title
  if (w.liked) icon(ctx, icons, String(w.like_icon || "heartfill"), tx0 + tsize * 0.4, ty, tsize * 0.8, rgbStr(ui1));
  text(ctx, tx0 + lx, ty, clip(ctx, title || "Unknown", tsize, tw0 - lx), tsize, col("ink"), "label", true, "left");
  if (artist) text(ctx, tx0, ty + ay2, clip(ctx, artist, asize, tw0), asize, col("ink2"), "label", false, "left");
  const by = compact ? 114 : 106, tx = compact ? ax : tx0, bx1 = compact ? x1 - 12 : tx0 + tw0, seeking = !!w.seeking, hh = seeking ? 3.5 : 2.5, kd = w.playing || idle ? 1 : 0.55; // paused: the bar dims with the artwork
  rrect(ctx, tx, by - hh, bx1, by + hh, hh, col("track"));
  const fx = prog > 0 ? tx + Math.max(4, (bx1 - tx) * prog) : tx;
  if (prog > 0) { const gr = ctx.createLinearGradient(tx, 0, bx1, 0); gr.addColorStop(0, rgbStr(ui1, kd)); gr.addColorStop(1, rgbStr(ui2, kd)); rrect(ctx, tx, by - hh, fx, by + hh, hh, gr as unknown as string); }
  if (seeking) { ctx.fillStyle = col("ink"); ctx.beginPath(); ctx.arc(fx, by, 6, 0, Math.PI * 2); ctx.fill(); } // the playhead while a finger is on the touch strip
  if (w.elapsed) { // elapsed on the left under the bar, total on the right
    const ry = by + (compact ? 13 : 15), total = String(w.total ?? "");
    if (seeking) {
      const lx2 = Math.max(tx + 16, Math.min(bx1 - 16, fx));
      text(ctx, lx2, ry, String(w.elapsed), 13, col("ink"), "mono", true, "center");
      if (lx2 + 26 < bx1 - width(ctx, total, 12, "mono", false)) text(ctx, bx1, ry, total, 12, col("ink3"), "mono", false, "right");
    } else { text(ctx, tx, ry, String(w.elapsed), 12, col("ink2"), "mono", false, "left"); text(ctx, bx1, ry, total, 12, col("ink3"), "mono", false, "right"); }
  }
}

type BrowseCol = { rows: { text: string; on: boolean; scroll?: number }[]; focus: boolean; empty: string; above: number; more: number };
function browse(ctx: Ctx, icons: Icons, w: Widget) {
  const tint = hexRgb(String(w.tint || "#3d8bff")), tint2 = hexRgb(String(w.tint2 || "#1fd1c4")), cols = (w.cols as BrowseCol[]) ?? [];
  const x0 = Number(w.x0 ?? 0), x1 = Number(w.x1 ?? 960), cw = (x1 - x0) / Math.max(1, cols.length), y0 = 30, rh = 20, accent = mixc(tint, tint2, 0.5);
  ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillRect((x0 === 0 ? x1 : x0) - 0.5, 34, 1, 92); // a faint line between the list and the player
  cols.forEach((c, ci) => {
    const cx0 = x0 + ci * cw, cx1 = cx0 + cw;
    if (!c.rows.length) { text(ctx, (cx0 + cx1) / 2, 80, clip(ctx, c.empty || "", 13, cw - 24), 13, col("ink3")); return; }
    const k = c.focus ? 1 : 0.5;
    c.rows.forEach((r, i) => {
      const cy = y0 + i * rh + rh / 2;
      if (r.on) { rrect(ctx, cx0 + 8, cy - rh / 2 + 1, cx1 - 8, cy + rh / 2 - 1, 2, rgbStr(accent, 0.3 * k)); rrect(ctx, cx0 + 8, cy - rh / 2 + 3, cx0 + 11, cy + rh / 2 - 3, 1, rgbStr(accent, k)); }
      rowText(ctx, cx0 + 22, cy, r.text, 14, cw - 44, r.on && c.focus ? col("ink") : col("ink2"), !!(r.on && c.focus), r.scroll);
    });
    if (c.above) icon(ctx, icons, "arrowup", cx1 - 14, y0 + 6, 10, col("ink3"), 1.4);
    if (c.more) icon(ctx, icons, "arrowdown", cx1 - 14, y0 + 5 * rh - 6, 10, col("ink3"), 1.4);
  });
}

// Word-wrap into lines no wider than maxw (a word longer than a line is cut). Mirrors Painter.wrap in the daemon.
function wrapLines(ctx: Ctx, str: string, size: number, maxw: number): string[] {
  const lines: string[] = []; let cur = "";
  for (let word of str.split(/\s+/).filter(Boolean)) {
    while (width(ctx, word, size, "mono", false) > maxw && word.length > 1) {
      let k = word.length; while (k > 1 && width(ctx, word.slice(0, k), size, "mono", false) > maxw) k--;
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(word.slice(0, k)); word = word.slice(k);
    }
    const t = (cur + " " + word).trim();
    if (cur && width(ctx, t, size, "mono", false) > maxw) { lines.push(cur); cur = word; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
// The last reply as up to n wrapped lines from line `scroll`, with small arrows on the right when there is more above or below.
function replyBlock(ctx: Ctx, icons: Icons, str: string, scroll: number, size: number, x: number, yFirst: number, pitch: number, n: number, maxw: number, xr: number) {
  const lines = wrapLines(ctx, str, size, maxw), top = Math.max(0, Math.min(Math.floor(scroll || 0), Math.max(0, lines.length - n)));
  lines.slice(top, top + n).forEach((ln, i) => text(ctx, x, yFirst + i * pitch, ln, size, col("ink3"), "mono", false, "left"));
  if (top > 0) icon(ctx, icons, "arrowup", xr, yFirst, 8, col("ink2"), 1.4);
  if (top + n < lines.length) icon(ctx, icons, "arrowdown", xr, yFirst + (n - 1) * pitch, 8, col("ink2"), 1.4);
}

function widget(ctx: Ctx, icons: Icons, w: Widget, accent: string, t: number) {
  const x0 = (w.col ?? 0) * G.col_w, ww = Number(w.w ?? w.span ?? 1) * G.col_w, cx = x0 + ww / 2;
  const y0 = G.body_top + Number(w.row ?? 0) * 50, y1 = y0 + Number(w.h ?? 2) * 50, x1 = x0 + ww; // the widget's cell(s): 8 columns x 2 rows of 120 x 50
  const str = (k: string) => String(w[k] ?? "");
  switch (w.type) {
    case "title": {
      const size = (T.type as Record<string, number>)[str("size") || "title"], ink = col(str("color") || "ink");
      if (w.sub) { text(ctx, cx, 74, str("text"), size, ink); text(ctx, cx, 74 + size / 2 + 16, str("sub"), T.type.note, col(str("sub_color") || "ink3"), "mono", false); }
      else text(ctx, cx, 80, str("text"), size, ink);
      break;
    }
    case "profile": { // which profile is active: its icon (or a dot in its colour) and its name; Auto / Master is the Master button's state
      const cy = (y0 + y1) / 2, acc = str("accent") || "#6b6b78", ic = appIcon(str("icon")), tx = x0 + 54;
      if (ic) ctx.drawImage(ic, x0 + 14, cy - 15, 30, 30); else rrect(ctx, x0 + 20, cy - 6, x0 + 32, cy + 6, 6, acc);
      text(ctx, tx, cy, clip(ctx, str("name"), 17, x1 - 12 - tx), 17, col("ink"), "label", true, "left");
      break;
    }
    case "tab": { // the browser's active tab: its icon, the site, the page title
      const cy = (y0 + y1) / 2, ic = appIcon(str("icon")), tx = x0 + 50, ink = w.idle ? col("ink3") : col("ink");
      if (ic) ctx.drawImage(ic, x0 + 14, cy - 13, 26, 26);
      if (w.host) { text(ctx, tx, cy - 9, str("host"), 12, col("ink3"), "mono", false, "left"); text(ctx, tx, cy + 10, clip(ctx, str("title"), 15, x1 - 14 - tx), 15, ink, "label", true, "left"); }
      else text(ctx, tx, cy, clip(ctx, str("title"), 15, x1 - 14 - tx), 15, ink, "label", true, "left");
      break;
    }
    case "browser": case "download": { // the browser's active tab with its state and any download; or just the download line. Mirrors w_browser / w_download in render.py
      const dl = (w.dl as { active?: boolean; done?: boolean; name?: string; size?: string; speed?: string }) || {}, tt = performance.now() / 1000;
      const dlLine = (x: number, y: number, maxw: number): boolean => {
        if (!dl.active && !dl.done) return false;
        const c = dl.done ? "#7ed37f" : "#6aa7ff";
        text(ctx, x, y, clip(ctx, (dl.done ? "Downloaded  " : "") + (dl.name ?? ""), 12, maxw - 150), 12, col("ink"), "label", true, "left");
        text(ctx, x + maxw, y, [dl.size, dl.speed].filter(Boolean).join(" · "), 11, col("ink3"), "mono", false, "right");
        rrect(ctx, x, y + 11, x + maxw, y + 14, 1.5, col("track"));
        if (dl.done) rrect(ctx, x, y + 11, x + maxw, y + 14, 1.5, c);
        else { const a = x + (maxw - 60) * ((tt * 0.8) % 1); rrect(ctx, a, y + 11, a + 60, y + 14, 1.5, c); }
        return true;
      };
      if (w.type === "download") { if (!dlLine(x0 + 14, y0 + 16, x1 - x0 - 28)) text(ctx, x0 + 14, (y0 + y1) / 2, "No downloads", 13, col("ink4"), "label", true, "left"); break; }
      const siteTile = (x: number, y: number, size: number, iconKey: string, mono: string, hue: string, r: number) => {
        const ic = iconKey ? appIcon(iconKey) : null;
        if (ic && isDarkIcon(ic)) { rrect(ctx, x, y, x + size, y + size, r, "#fff"); const n = Math.round(size * 0.78), o = (size - n) / 2; ctx.drawImage(ic, x + o, y + o, n, n); }
        else if (ic) ctx.drawImage(ic, x, y, size, size); // an icon that was fetched stands on its own: no tile behind it
        else { rrect(ctx, x, y, x + size, y + size, r, `color-mix(in srgb, ${hue || "#d97757"} 28%, #000)`); text(ctx, x + size / 2, y + size / 2, mono || "?", size * 0.55, hue || "#d97757", "label", true, "center"); }
      };
      const wide = x1 - x0 >= 600, ix1 = x0 + 360, tx = x0 + 72, by = y0 + 62, pop = (w.pop as { kind?: string; age?: number } | null) || null, age = pop?.age ?? 9;
      const favs = (w.favs as { icon: string; mono: string; hue: string; title: string; open: boolean; color?: string }[]) || [], hp = claudeHelpers(ctx, icons);
      const favTile = (x: number, y: number, f: typeof favs[number] | undefined) => { // a favourite over its button; dashed outline when the slot is empty
        if (!f) { ctx.save(); ctx.setLineDash([5, 4]); rrect(ctx, x, y, x + 106, y + 46, 10, undefined, "#565868", 1); ctx.restore(); return; }
        if (f.open) rrect(ctx, x, y, x + 106, y + 46, 10, `color-mix(in srgb, ${f.color || "#6aa7ff"} 30%, #000)`); // only the open one has a fill, in its button's colour
        siteTile(x + 6, y + 6, 34, f.icon, f.mono, f.hue, 8);
        const lines = linesN(ctx, hp, f.title || "", 10.5, 106 - 46 - 4, 2, "label", true);
        lines.forEach((ln, i) => text(ctx, x + 44, y + 23 + (i - (lines.length - 1) / 2) * 12, ln, 10.5, f.open ? col("ink") : col("ink2"), "label", true, "left"));
      };
      if (x1 - x0 < 300) { // squeezed to 2 columns (the media player is over the rest): tab info and the first two favourites. Mirrors w_browser_compact
        siteTile(x0 + 14, y0 + 4, 46, str("icon"), str("mono"), str("hue"), 11);
        const ctx2 = x0 + 72, pp = (w.pop as { kind?: string; age?: number } | null) || null, ag = pp?.age ?? 9, bmp = pp && (pp.kind === "added" || pp.kind === "removed") ? Math.max(0, 1 - ag / 0.6) : 0;
        text(ctx, ctx2, y0 + 14, clip(ctx, str("host"), 12, x1 - 14 - ctx2 - 20), 12, col("ink3"), "mono", false, "left");
        text(ctx, ctx2, y0 + 38, clip(ctx, str("title"), 15, x1 - 14 - ctx2), 15, w.idle ? col("ink3") : col("ink"), "label", true, "left");
        icon(ctx, icons, w.saved ? "starfill" : "star", x1 - 22, y0 + 14, 14 + 8 * bmp, w.saved ? "#f5c542" : col("ink3"), 1.5);
        if (dl.active || dl.done) dlLine(x0 + 14, y0 + 66, x1 - x0 - 28);
        else if (w.loading) { rrect(ctx, x0 + 14, y0 + 70, x1 - 14, y0 + 73, 1.5, col("track")); const a = x0 + 14 + (x1 - x0 - 28 - 90) * ((tt * 0.9) % 1); rrect(ctx, a, y0 + 70, a + 90, y0 + 73, 1.5, "#ffb040"); }
        else { const n = Number(w.n_saved) || 0; text(ctx, x0 + 14, y0 + 70, `${n} favourite${n === 1 ? "" : "s"}`, 11, col("ink3"), "mono", false, "left"); }
        for (let i = 0; i < 2; i++) favTile(x0 + i * 120 + 7, 110, favs[i]);
        break;
      }
      if (dl.active || dl.done) { // the download sits in the gap between the two rows of favourite tiles
        const bx = ix1 + 7, bw = (wide ? x1 - 7 : x0 + 473) - bx, by0 = y0 + 30, c = dl.done ? "#7ed37f" : "#6aa7ff";
        text(ctx, bx, by0, clip(ctx, (dl.done ? "Downloaded " : "") + (dl.name ?? ""), 12, bw), 12, col("ink"), "label", true, "left");
        rrect(ctx, bx, by0 + 12, bx + bw, by0 + 16, 2, col("track"));
        if (dl.done) rrect(ctx, bx, by0 + 12, bx + bw, by0 + 16, 2, c);
        else { const a = bx + (bw - 50) * ((tt * 0.8) % 1); rrect(ctx, a, by0 + 12, a + 50, by0 + 16, 2, c); }
        text(ctx, bx, by0 + 28, clip(ctx, [dl.size, dl.speed].filter(Boolean).join(" · "), 11, bw), 11, col("ink3"), "mono", false, "left");
      }
      siteTile(x0 + 14, y0 + 4, 46, str("icon"), str("mono"), str("hue"), 11);
      {
        text(ctx, tx, y0 + 14, str("host"), 12, col("ink3"), "mono", false, "left");
        text(ctx, tx, y0 + 38, clip(ctx, str("title"), 17, ix1 - 100 - tx), 17, w.idle ? col("ink3") : col("ink"), "label", true, "left");
        const sx = ix1 - 28, sy = y0 + 38, bump = pop && (pop.kind === "added" || pop.kind === "removed") ? Math.max(0, 1 - age / 0.6) : 0;
        icon(ctx, icons, w.saved ? "starfill" : "star", sx, sy, 18 + 10 * bump, w.saved ? "#f5c542" : col("ink3"), 1.5);
        if (pop?.kind === "added" && age < 0.7) {
          const r = 8 + age * 26, fade = 1 - age / 0.7;
          ctx.globalAlpha = fade; ctx.strokeStyle = "#f5c542"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
          for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.4; sparkle(ctx, sx + Math.cos(a) * (r + 4), sy + Math.sin(a) * (r + 4), "#ffe08a"); }
          ctx.globalAlpha = 1;
        }
        if (pop && age < 1.4) { const m = ({ added: ["ADDED", "#7ed37f"], removed: ["REMOVED", "#9a9aa8"], full: ["FULL", "#ff7a59"], error: ["NO ANSWER", "#ff7a59"] } as Record<string, string[]>)[pop.kind ?? ""] ?? ["", "#fff"]; text(ctx, ix1 - 14, y0 + 14, m[0], 11, m[1], "mono", true, "right"); }
        else if (w.loading) { ctx.globalAlpha = 0.55 + 0.45 * Math.sin(tt * 6); text(ctx, ix1 - 14, y0 + 14, "LOADING", 11, "#ffb040", "mono", true, "right"); ctx.globalAlpha = 1; }
        else if (!w.idle) text(ctx, ix1 - 14, y0 + 14, w.secure ? "SECURE" : "NOT SECURE", 11, w.secure ? "#7ed37f" : "#ff7a59", "mono", true, "right");
        if (w.loading) { rrect(ctx, tx, by, ix1 - 14, by + 3, 1.5, col("track")); const a = tx + (ix1 - 14 - tx - 90) * ((tt * 0.9) % 1); rrect(ctx, a, by, a + 90, by + 3, 1.5, "#ffb040"); }
        else {
          const n = Number(w.n_saved) || 0, pages = Number(w.pages) || 1, pg = Number(w.page) || 0;
          text(ctx, tx, by + 4, `${n} favourite${n === 1 ? "" : "s"}` + (pages > 1 ? `  ·  page ${pg + 1}/${pages}` : ""), 11, col("ink3"), "mono", false, "left");
          for (let k = 0; pages > 1 && k < pages; k++) { ctx.fillStyle = k === pg ? "#f5c542" : col("ink4"); ctx.beginPath(); ctx.arc(ix1 - 14 - (pages - k) * 10 + 6, by + 4, 3, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      for (let i = 0; i < (wide ? 6 : 4); i++) favTile(x0 + i * 120 + 7, 110, favs[i]);
      (wide ? [6, 7, 8] : [4]).forEach((i, j) => favTile(x0 + (3 + j) * 120 + 7, 4, favs[i]));
      break;
    }
    case "clock": { // 2x1 time + stacked date; 2x2 big time + date + day bar; 2x2 "analog" dial + time. Mirrors w_clock in the daemon.
      const t = str("time"), date = str("date"), [hh, mm] = t.split(":").map((v) => parseInt(v, 10) || 0);
      const ap = str("ampm"), h24 = ap ? (hh % 12 + (ap === "PM" ? 12 : 0)) : hh, night = h24 >= 22 || h24 < 6, ctt = performance.now() / 1000, orange = "#d97757"; // the little worker sleeps at night
      const tm = w.timer as { state: string; text: string; label: string; frac: number; kind?: string; color?: string; dots?: number; phase?: string } | undefined;
      if (Number(w.h ?? 2) === 1 && tm) { // the 2x1 clock while it is the timer: time left, state, a bar of what is left
        const flash = tm.state === "done" && Math.floor(performance.now() / 500) % 2 === 0;
        const hp = claudeHelpers(ctx, icons), look = str("mascot") || "pip";
        if (tm.state === "done") buddy(ctx, hp, look, "done", x0 + 122, y0 + 38, 1, { jump: Math.abs(Math.sin(ctt * 7)) * 5 });
        else if (tm.dots !== undefined && (tm.state === "pause" || tm.phase !== "focus")) buddy(ctx, hp, look, "plain", x0 + 122, y0 + 38, 1, { tomato: true });
        else if (tm.state === "pause") buddy(ctx, hp, look, "sleep", x0 + 122, y0 + 38, 1);
        else buddy(ctx, hp, look, "timer", x0 + 122, y0 + 38, 1, { tomato: tm.dots !== undefined });
        text(ctx, x0 + 14, y0 + 25, tm.text, 30, flash ? col("warn") : col("ink"), "label", true, "left");
        text(ctx, x1 - 14, y0 + 18, tm.kind ?? "TIMER", 12, col("ink2"), "mono", false, "right");
        text(ctx, x1 - 14, y0 + 34, tm.label, 12, flash ? col("warn") : col("ink3"), "mono", false, "right");
        rrect(ctx, x0 + 14, y0 + 44, x1 - 14, y0 + 47, 1.5, col("track"));
        if (tm.frac > 0) rrect(ctx, x0 + 14, y0 + 44, x0 + 14 + Math.max(3, (x1 - x0 - 28) * tm.frac), y0 + 47, 1.5, tm.state === "pause" ? col("ink3") : tm.color ?? col("ink2"));
      } else if (Number(w.h ?? 2) === 1) {
        const sep = date.includes(",") ? date.indexOf(",") : date.indexOf(" "), day = sep > 0 ? date.slice(0, sep) : date, rest = sep > 0 ? date.slice(sep + 1).trim() : "";
        text(ctx, x0 + 14, y0 + 25, t, 30, col("ink"), "label", true, "left");
        if (ap) text(ctx, x0 + 14 + width(ctx, t, 30, "label", true) + 4, y0 + 31, ap, 12, col("ink2"), "mono", false, "left");
        buddy(ctx, claudeHelpers(ctx, icons), str("mascot") || "pip", night ? "sleep" : "plain", x0 + 122, y0 + 38, 1);
        text(ctx, x1 - 14, y0 + 18, day, 12, col("ink2"), "mono", false, "right");
        text(ctx, x1 - 14, y0 + 34, rest, 12, col("ink3"), "mono", false, "right");
      } else if (tm) { // the 2x2 clocks while it is the timer: a big countdown, its state, a bar of what is left
        const flash = tm.state === "done" && Math.floor(performance.now() / 500) % 2 === 0, hp = claudeHelpers(ctx, icons), look = str("mascot") || "pip";
        text(ctx, x0 + 14, y0 + 34, tm.text, 48, flash ? col("warn") : col("ink"), "label", true, "left");
        text(ctx, x0 + 14, y0 + 60, (tm.kind ?? "TIMER") + "  ·  " + tm.label.toUpperCase(), 13, flash ? col("warn") : col("ink3"), "mono", false, "left");
        rrect(ctx, x0 + 14, y0 + 88, x1 - 14, y0 + 92, 2, col("track"));
        if (tm.frac > 0) rrect(ctx, x0 + 14, y0 + 88, x0 + 14 + Math.max(4, (x1 - x0 - 28) * tm.frac), y0 + 92, 2, tm.state === "pause" ? col("ink3") : tm.color ?? orange);
        if (tm.dots !== undefined) { // pomodoro: a tomato per focus round done in this set of four, and a big one that bobs
          for (let k = 0; k < 4; k++) tomato(ctx, x0 + 14 + k * 15 + 5, y0 + 77, 5, k < tm.dots ? "#e5483b" : null);
        }
        const pomo = tm.dots !== undefined; // the pomodoro's mascot is a tomato: it holds the timer while focusing and rests on a break
        buddy(ctx, hp, look, tm.state === "done" ? "done" : pomo && (tm.state === "pause" || tm.phase !== "focus") ? "plain" : tm.state === "pause" ? "sleep" : "timer", x1 - 36, y0 + 87, 2, { jump: tm.state === "done" ? Math.abs(Math.sin(ctt * 7)) * 5 : 0, tomato: pomo });
      } else if (w.style === "analog") {
        const dx = x0 + 14 + 38, dy = y0 + 50, r = 36;
        ctx.lineCap = "butt";
        for (let k = 0; k < 12; k++) {
          const a = k * Math.PI / 6, r0 = r - (k % 3 === 0 ? 9 : 5);
          ctx.strokeStyle = k % 3 === 0 ? col("ink") : col("ink3"); ctx.lineWidth = k % 3 === 0 ? 2 : 1.5;
          ctx.beginPath(); ctx.moveTo(dx + r0 * Math.sin(a), dy - r0 * Math.cos(a)); ctx.lineTo(dx + r * Math.sin(a), dy - r * Math.cos(a)); ctx.stroke();
        }
        ctx.lineCap = "round";
        for (const [ang, ln, wd, c] of [[(hh % 12 + mm / 60) / 12 * 2 * Math.PI, 19, 4, "ink"], [mm / 60 * 2 * Math.PI, 28, 3, "ink2"]] as [number, number, number, string][]) {
          ctx.strokeStyle = col(c); ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + ln * Math.sin(ang), dy - ln * Math.cos(ang)); ctx.stroke();
        }
        ctx.fillStyle = col("ink"); ctx.beginPath(); ctx.arc(dx, dy, 3, 0, Math.PI * 2); ctx.fill();
        text(ctx, dx + r + 18, y0 + 42, t, 30, col("ink"), "label", true, "left");
        if (ap) text(ctx, dx + r + 18 + width(ctx, t, 30, "label", true) + 4, y0 + 48, ap, 12, col("ink2"), "mono", false, "left");
        text(ctx, dx + r + 18, y0 + 66, date, 13, col("ink3"), "mono", false, "left");
        const sa = new Date().getSeconds() / 60 * 2 * Math.PI; // a thin second hand, ticking
        ctx.strokeStyle = orange; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + 31 * Math.sin(sa), dy - 31 * Math.cos(sa)); ctx.stroke();
        buddy(ctx, claudeHelpers(ctx, icons), str("mascot") || "pip", night ? "sleep" : "plain", x1 - 28, y0 + 94, 1);
      } else {
        text(ctx, x0 + 14, y0 + 34, t, 48, col("ink"), "label", true, "left");
        if (ap) text(ctx, x0 + 14 + width(ctx, t, 48, "label", true) + 6, y0 + 44, ap, 14, col("ink2"), "mono", false, "left");
        text(ctx, x0 + 14, y0 + 60, date, 14, col("ink3"), "mono", false, "left");
        const xa = x0 + 14, xb = x1 - 14, frac = (h24 * 60 + mm) / 1440; // the day bar: night blue, noon gold, evening orange; the worker stands at "now"
        rrect(ctx, xa, y0 + 88, xb, y0 + 92, 2, col("track"));
        const stops: [number, number[]][] = [[0, [74, 90, 154]], [0.3, [245, 197, 66]], [0.6, [245, 197, 66]], [0.85, [217, 119, 87]], [1, [74, 90, 154]]];
        for (let px = 0; px < Math.max(2, Math.floor((xb - xa) * frac)); px += 2) {
          const u = px / (xb - xa); let j = 1; while (j < stops.length - 1 && u > stops[j][0]) j++;
          ctx.fillStyle = rgbStr(mixc(stops[j - 1][1], stops[j][1], (u - stops[j - 1][0]) / (stops[j][0] - stops[j - 1][0]))); ctx.fillRect(xa + px, y0 + 88, 2, 4);
        }
        buddy(ctx, claudeHelpers(ctx, icons), str("mascot") || "pip", night ? "sleep" : "plain", Math.max(xa, Math.min(xa + (xb - xa) * frac - 12, xb - 24)), y0 + 87, 2);
      }
      break;
    }
    case "limit": drawLimit(ctx, claudeHelpers(ctx, icons), w as Record<string, unknown>); break;
    case "ask_banner": drawAskBanner(ctx, claudeHelpers(ctx, icons), w as Record<string, unknown>, x0, y0, x1, y1); break;
    case "ask": drawAsk(ctx, claudeHelpers(ctx, icons), w as Record<string, unknown>, accent); break;
    case "claude_session": drawClaude(ctx, claudeHelpers(ctx, icons), w as Record<string, unknown>, x0, y0, x1, y1); break;
    case "usage": { // plan limits of one tool; its name once, in its own colour. which="both": the 5-hour and weekly limits one above the other
      const pc = str("provider_color") || "#b4b4c0", name = str("provider").toUpperCase(), rows = (w.rows as { label: string; pct: number | null; color: string; sub: string }[]) ?? [];
      if (w.which === "both" && rows.length) { // like the Claude app's own panel, all left-aligned: a title, then rows of label ... detail  percentage over a thin bar
        text(ctx, x0 + 14, y0 + 8, name, 12, pc, "mono", true, "left");
        const known = rows.filter((r) => r.pct != null), topR = known.length ? known.reduce((a, b) => (Number(b.pct) > Number(a.pct) ? b : a)) : null, utt = performance.now() / 1000;
        mood(ctx, claudeHelpers(ctx, icons), str("mascot") || "pip", x1 - 26, y0 + 14, topR ? Number(topR.pct) : null, topR?.color === "provider" ? pc : col(topR?.color || "good"), 1);
        if (w.plan) text(ctx, x0 + 14 + width(ctx, name, 12, "mono", true), y0 + 8, " · " + str("plan").toUpperCase(), 12, col("ink3"), "mono", false, "left");
        const pitch = rows.length >= 3 ? 27 : 38;
        rows.forEach((r, i) => {
          const top = y0 + 19 + i * pitch, pct = r.pct == null ? null : Math.max(0, Math.min(100, Number(r.pct))), shown = pct == null ? "--" : `${pct}%`;
          text(ctx, x0 + 14, top + 6, r.label, 13, col("ink"), "label", true, "left");
          text(ctx, x1 - 14, top + 6, shown, 13, pct == null ? col("ink3") : col("ink"), "label", true, "right");
          text(ctx, x1 - 14 - width(ctx, shown, 13, "label", true) - 8, top + 6, r.sub ?? "", 12, col("ink3"), "mono", false, "right");
          rrect(ctx, x0 + 14, top + 16, x1 - 14, top + 20, 2, col("track"));
          if (pct) {
            const ex = x0 + 14 + Math.max(4, (x1 - x0 - 28) * pct / 100), c = r.color === "provider" ? pc : col(r.color || "good");
            rrect(ctx, x0 + 14, top + 16, ex, top + 20, 2, c); rrect(ctx, ex - 4, top + 16, ex, top + 20, 2, rgbStr(mixc(hexRgb(c), [255, 255, 255], 0.35 + 0.35 * Math.sin(utt * 4)))); // a lit tip
          }
        });
        break;
      }
      const pct = w.pct == null ? null : Math.max(0, Math.min(100, Number(w.pct))), color = col(str("color") || "good"), win = " · " + str("caption").toUpperCase(), shown = pct == null ? "--" : `${pct}%`;
      if (Number(w.h ?? 2) === 1) {
        text(ctx, x0 + 14, y0 + 13, name, 12, pc, "mono", true, "left");
        text(ctx, x0 + 14 + width(ctx, name, 12, "mono", true), y0 + 13, win, 12, col("ink3"), "mono", false, "left");
        text(ctx, x0 + 14, y0 + 35, shown, 22, pct == null ? col("ink3") : col("ink"), "label", true, "left");
        const bx0 = x0 + 78, bx1 = x1 - 14, utt = performance.now() / 1000;
        mood(ctx, claudeHelpers(ctx, icons), str("mascot") || "pip", x1 - 26, y0 + 18, pct, color, 1);
        rrect(ctx, bx0, y0 + 32, bx1, y0 + 38, 3, col("track"));
        if (pct) { const ex = bx0 + Math.max(6, (bx1 - bx0) * pct / 100); rrect(ctx, bx0, y0 + 32, ex, y0 + 38, 3, color); rrect(ctx, ex - 5, y0 + 32, ex, y0 + 38, 3, rgbStr(mixc(hexRgb(color), [255, 255, 255], 0.35 + 0.35 * Math.sin(utt * 4)))); }
        break;
      }
      const dx = x0 + 14 + 34, dy = y0 + 50, r = 30;
      ctx.lineWidth = 8; ctx.lineCap = "butt";
      ctx.strokeStyle = col("track"); ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.stroke();
      const utt = performance.now() / 1000;
      if (pct) {
        ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(dx, dy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct / 100); ctx.stroke();
        const a = -Math.PI / 2 + Math.PI * 2 * pct / 100; // a lit dot at the end of the arc
        ctx.fillStyle = rgbStr(mixc(hexRgb(color), [255, 255, 255], 0.4 + 0.4 * Math.sin(utt * 4))); ctx.beginPath(); ctx.arc(dx + r * Math.cos(a), dy + r * Math.sin(a), 4, 0, Math.PI * 2); ctx.fill();
      }
      mood(ctx, claudeHelpers(ctx, icons), str("mascot") || "pip", x1 - 14 - 24, y0 + 60, pct, color, 2);
      const tx = dx + r + 20;
      text(ctx, tx, y0 + 22, name, 13, pc, "mono", true, "left");
      text(ctx, tx + width(ctx, name, 13, "mono", true), y0 + 22, win, 13, col("ink3"), "mono", false, "left");
      text(ctx, tx, y0 + 52, shown, 34, pct == null ? col("ink3") : col("ink"), "label", true, "left");
      if (w.sub) text(ctx, tx, y0 + 80, str("sub"), 13, col("ink3"), "mono", false, "left");
      break;
    }
    case "now_playing": nowPlaying(ctx, icons, w); break;
    case "browse": browse(ctx, icons, w); break;
    case "wave": {
      const tt = t * 0.4;
      for (let i = 0; i < 48; i++) {
        const h = 20 + 30 * (Math.sin(tt + i * 0.3) + 1) + 14 * (Math.sin(tt * 1.7 + i * 0.11) + 1);
        rrect(ctx, 12 + i * 19.5, 80 - h / 2, 24 + i * 19.5, 80 + h / 2, 5, `hsl(${((i / 48 + tt * 0.05) % 1) * 360} 70% 60%)`);
      }
      break;
    }
    case "rainbow": {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${((i / 6 + t * 0.3) % 1) * 360} 100% 50%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); text(ctx, W / 2, 80, str("text") || "PUSH 2 ONLINE", 52, "#000");
      break;
    }
  }
}

let blurTmp: HTMLCanvasElement | null = null;
// Every short message (Saved, Shuffle on, a knob's value) is this one shape: the picture behind goes soft and dark, a rounded pill with an icon
// and a few words in the middle, and for a knob a slim bar of its value. It fades in and out (p.a).
function pill(ctx: Ctx, icons: Icons, p: NonNullable<Spec["pill"]>) {
  const cv = ctx.canvas;
  blurTmp = blurTmp ?? document.createElement("canvas"); blurTmp.width = cv.width; blurTmp.height = cv.height;
  blurTmp.getContext("2d")!.drawImage(cv, 0, 0);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = p.a ?? 1; ctx.filter = `blur(${5 * SCALE}px)`; ctx.drawImage(blurTmp, 0, 0); ctx.filter = "none";
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore();
  ctx.save(); ctx.globalAlpha = p.a ?? 1;
  const size = 17, hasV = p.value != null, tw = width(ctx, p.text, size, "label"), iw = p.icon ? 32 : 0, vw = hasV ? width(ctx, p.vtext ?? "", size, "label") + 24 : 0;
  const w = Math.max(hasV ? 300 : 0, tw + iw + vw + 40), h = hasV ? 54 : 38, x0 = 480 - w / 2, y0 = 80 - h / 2, cy = y0 + (hasV ? 19 : h / 2);
  rrect(ctx, x0, y0, x0 + w, y0 + h, hasV ? 19 : h / 2, "#181818"); ctx.strokeStyle = col("ink4"); ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x0, y0, w, h, hasV ? 19 : h / 2); ctx.stroke();
  if (p.icon) icon(ctx, icons, p.icon, x0 + 31, cy, 18, col("ink"));
  text(ctx, x0 + 20 + iw, cy, p.text, size, col("ink"), "label", true, "left");
  if (hasV) {
    text(ctx, x0 + w - 22, cy, p.vtext ?? "", size, col("ink"), "label", true, "right");
    const bx0 = x0 + 22, bx1 = x0 + w - 22, by = y0 + 39;
    rrect(ctx, bx0, by, bx1, by + 5, 2.5, col("track"));
    rrect(ctx, bx0, by, bx0 + Math.max(5, (bx1 - bx0) * Math.max(0, Math.min(100, p.value!)) / 100), by + 5, 2.5, col("ink"));
  }
  ctx.restore();
}

// A change of view (Full to Half, Browse in or out, ...) arrives with a short wipe from the left instead of a cut. Mirrors render.wipe in the daemon.
let lastKey = "", snap: HTMLCanvasElement | null = null, maskCv: HTMLCanvasElement | null = null, trans = 0;
function wipe(ctx: Ctx, now: number) {
  const p0 = (now - trans) / 320;
  if (!snap || p0 >= 1) { trans = 0; return; }
  const cv = ctx.canvas, p = p0 * p0 * (3 - 2 * p0), edge = 320, front = p * (W + edge);
  maskCv = maskCv ?? document.createElement("canvas"); maskCv.width = cv.width; maskCv.height = cv.height;
  const m = maskCv.getContext("2d")!; m.globalCompositeOperation = "source-over"; m.drawImage(snap, 0, 0);
  const g = m.createLinearGradient((front - edge) * SCALE, 0, front * SCALE, 0); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,1)");
  m.globalCompositeOperation = "destination-in"; m.fillStyle = g; m.fillRect(0, 0, cv.width, cv.height);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(maskCv, 0, 0); ctx.restore();
}

// One spec painted straight onto the canvas (no view-change wipe): used for the widget samples in the Widgets column.
export function paint(ctx: Ctx, icons: Icons, spec: Spec, t = Date.now() / 1000) {
  ctx.save(); ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.fillStyle = col("bg"); ctx.fillRect(0, 0, W, H);
  for (const w of spec.widgets) widget(ctx, icons, w, spec.accent, t);
  zones(ctx, icons, spec, spec.accent);
  ctx.restore();
}

export function draw(ctx: Ctx, icons: Icons, scene: Scene | null, t = Date.now() / 1000) {
  const key = scene ? `${scene.kind}|${scene.spec.view ?? ""}` : "", cvs = ctx.canvas;
  if (key !== lastKey) {
    if (lastKey && key && !lastKey.startsWith("message") && !key.startsWith("message")) {
      snap = snap ?? document.createElement("canvas"); snap.width = cvs.width; snap.height = cvs.height;
      snap.getContext("2d")!.drawImage(cvs, 0, 0); trans = performance.now();
    }
    lastKey = key;
  }
  ctx.save(); ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.fillStyle = col("bg"); ctx.fillRect(0, 0, W, H);
  const s = scene?.spec;
  if (s) {
    for (const w of s.widgets) widget(ctx, icons, w, s.accent, t);
    if (!s.no_zones) zones(ctx, icons, s, s.accent);
    if (s.pill) pill(ctx, icons, s.pill);
  }
  ctx.restore();
  if (trans) wipe(ctx, performance.now());
}

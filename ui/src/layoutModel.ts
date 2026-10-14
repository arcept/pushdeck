import type { Widget } from "./display/render";
import T from "./display/tokens.json";

export type W = Widget & { type: string; col: number; row: number; w: number; h: number };
export const COLS = 8, ROWS = 2;
export const DEFAULT_LAYOUT = (T as unknown as { layout_default: W[] }).layout_default;

export type Btn = { label: string; icon?: string };
export type Buttons = { up: Btn[]; down: Btn[] };
type Entry = { match: Record<string, unknown>; up?: Btn[]; down?: Btn[]; edge?: Btn[] };
const APPS = (T as unknown as { widget_apps: Record<string, string[]> }).widget_apps;
const TABLE = (T as unknown as { widget_buttons: Entry[] }).widget_buttons;
// Mirrors layout.kind / available / buttons_of in the daemon: which apps a widget belongs to, and the display buttons it brings along.
export const kindOf = (x: W) => (x.type === "usage" ? String(x.provider ?? "claude") : x.type === "claude_session" ? "claude" : x.type === "tab" || x.type === "browser" ? "tab" : "");
export const appsOf = (x: W) => APPS[kindOf(x)] ?? null;
export const availableFor = (x: W, bundles: string[]) => { const a = appsOf(x); return !a || bundles.some((b) => a.includes(b)); };
export function buttonsOf(x: W): Buttons | null {
  const e = TABLE.find((t) => Object.entries(t.match).every(([k, v]) => (k === "provider" ? String(x.provider ?? "claude") : (x as Record<string, unknown>)[k]) === v));
  if (!e) return null;
  const up = [...(e.up ?? [])], down = [...(e.down ?? [])];
  if (e.edge) (x.row === 0 ? up : down).push(...e.edge);
  return { up, down };
}
// Where a widget's frame reaches beyond its cells: the button strips above / below the body.
export const reach = (x: W) => { const b = buttonsOf(x); return { up: !!b?.up.length, down: !!b?.down.length }; };

// The profile shortcuts a widget's buttons would hide when it stands at x: their labels. Widget columns are the profile's own button numbers (the half view's side is only a shift on the Push).
export function replaces(x: W, controls: Record<string, { label?: string; action?: { type?: string } }>): string[] {
  const b = buttonsOf(x); if (!b) return [];
  const out: string[] = [];
  for (const [row, list] of [["upper", b.up], ["lower", b.down]] as const) list.forEach((_, i) => {
    const c = controls[`btn-${row}-${x.col + i + 1}`]; if (c?.label && c.action?.type !== "pin") out.push(c.label);
  });
  return out;
}

export type Proto = { id: string; group: string; cap: string; make: () => W };
const w = (type: string, ww: number, h: number, extra: object = {}): W => ({ type, col: 0, row: 0, w: ww, h, ...extra });
// Every size each widget comes in, so the Widgets column can show them all. `buttons` are the display buttons a widget brings with it
// (the player's are the ones the daemon's media_ui.buttons() maps); other widgets have none yet.
export const PALETTE: Proto[] = [
  { id: "player-s", group: "Media player", cap: "Compact", make: () => w("player", 2, 2) },   // the large player is the Layout button's overlay, not a widget
  { id: "profile-1", group: "Profile", cap: "Icon", make: () => w("profile", 1, 1) },
  { id: "profile-2", group: "Profile", cap: "Icon + name", make: () => w("profile", 2, 1) },
  { id: "clock-s", group: "Clock", cap: "Time + date", make: () => w("clock", 2, 1) },
  { id: "clock-l", group: "Clock", cap: "Large + day bar", make: () => w("clock", 2, 2) },
  { id: "clock-a", group: "Clock", cap: "Analog", make: () => w("clock", 2, 2, { style: "analog" }) },
  { id: "claude-all", group: "Claude usage", cap: "Limits + context", make: () => w("usage", 2, 2, { provider: "claude", which: "both", context: true }) },
  { id: "claude-5h", group: "Claude usage", cap: "5-hour bar", make: () => w("usage", 2, 1, { provider: "claude", which: "five_hour", context: false }) },
  { id: "claude-5h-ring", group: "Claude usage", cap: "5-hour ring", make: () => w("usage", 2, 2, { provider: "claude", which: "five_hour", context: false }) },
  { id: "claude-7d", group: "Claude usage", cap: "Weekly bar", make: () => w("usage", 2, 1, { provider: "claude", which: "seven_day", context: false }) },
  { id: "claude-ctx", group: "Claude usage", cap: "Context window", make: () => w("usage", 2, 1, { provider: "claude", which: "context", context: true }) },
  { id: "session-l", group: "Claude session", cap: "Large", make: () => w("claude_session", 4, 2) },
  { id: "session-s", group: "Claude session", cap: "Compact", make: () => w("claude_session", 2, 2) },
  { id: "session-w", group: "Claude session", cap: "Wide", make: () => w("claude_session", 4, 1) },
  { id: "codex-all", group: "Codex usage", cap: "Both limits", make: () => w("usage", 2, 2, { provider: "codex", which: "both", context: false }) },
  { id: "codex-5h", group: "Codex usage", cap: "5-hour bar", make: () => w("usage", 2, 1, { provider: "codex", which: "five_hour", context: false }) },
  { id: "codex-7d", group: "Codex usage", cap: "Weekly bar", make: () => w("usage", 2, 1, { provider: "codex", which: "seven_day", context: false }) },
  { id: "browser-l", group: "Browser", cap: "4 favourites", make: () => w("browser", 4, 2) },
  { id: "browser-xl", group: "Browser", cap: "8 favourites", make: () => w("browser", 6, 2) },
  { id: "download-s", group: "Downloads", cap: "Progress", make: () => w("download", 2, 1) },
  { id: "tab-wide", group: "Browser tab", cap: "Wide", make: () => w("tab", 4, 1) },
  { id: "tab-s", group: "Browser tab", cap: "Compact", make: () => w("tab", 2, 1) },
];
export const NAMES: Record<string, string> = { player: "Media player", profile: "Profile", clock: "Clock", usage: "AI usage", tab: "Browser tab" };
export const describe = (x: W) => x.type === "usage" ? `${x.provider === "codex" ? "Codex" : "Claude"} usage` : NAMES[x.type] ?? x.type;

const hit = (a: W, b: W) => a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
const isPlayer = (x: W) => x.type === "player";
// A 4-wide player sits on the left or right half only (columns 0 or 4); a 2-wide one goes anywhere. Only one player in the layout.
export const inside = (x: W) => x.col >= 0 && x.row >= 0 && x.col + x.w <= COLS && x.row + x.h <= ROWS && x.w >= 1 && x.h >= 1 && (!isPlayer(x) || x.w < 4 || (x.row === 0 && (x.col === 0 || x.col === 4)));
export const fits = (list: W[], x: W, skip = -1) => inside(x) && !list.some((o, i) => i !== skip && (hit(o, x) || (isPlayer(o) && isPlayer(x))));
export function findSpot(list: W[], x: W): W | null {
  for (let r = 0; r <= ROWS - x.h; r++) for (let c = 0; c <= COLS - x.w; c++) { const t = { ...x, col: c, row: r }; if (fits(list, t)) return t; }
  return null;
}
export const clampTo = (x: W): W => {
  const col = Math.max(0, Math.min(COLS - x.w, x.col)), row = Math.max(0, Math.min(ROWS - x.h, x.row));
  return isPlayer(x) && x.w >= 4 ? { ...x, col: col < 2 ? 0 : 4, row: 0 } : { ...x, col, row };
};
// The list with the new widget in it: a 4-wide player takes the place of any player already there (a 2-wide one is refused while there is one).
export function withWidget(list: W[], x: W): W[] | null {
  if (isPlayer(x) && x.w >= 4) { const rest = list.filter((o) => !isPlayer(o)); return fits(rest, x) ? [...rest, x] : null; }
  return fits(list, x) ? [...list, x] : null;
}

// The sizes a widget comes in are its palette versions (same widget, same service); resizing on the screen snaps to the nearest of those.
const family = (x: W) => PALETTE.map((p) => p.make()).filter((m) => m.type === x.type && (x.type !== "usage" || m.provider === x.provider));
export const sizesOf = (x: W) => new Set(family(x).map((m) => `${m.w}x${m.h}`)).size;
export function resizeTo(x: W, tw: number, th: number): W {
  const sameKind = (m: W) => (m.which === x.which ? 2 : 0) + ((m.style ?? "") === (x.style ?? "") ? 1 : 0);
  let best: W | null = null, bd = 1e9;
  for (const m of family(x)) {
    const d = Math.abs(m.w - tw) + Math.abs(m.h - th) + (m.w === x.w && m.h === x.h ? -0.01 : 0) - sameKind(m) * 0.001;
    if (d < bd) { bd = d; best = m; }
  }
  return best ? { ...best, col: x.col, row: x.row } : x;
}

// Moving widget i to `to` (same size, new place). Free ground: just move. Otherwise the widgets in the way swap out of it:
//  1. they move the opposite way by the same distance (a half-screen widget changing halves takes the other half's widgets across with their layout);
//  2. if that does not fit (different sizes), each goes to the nearest free spot to where that would have put it, biggest first;
//  3. if there is no room for them, the move is refused (null).
export function planMove(list: W[], i: number, to: W): W[] | null {
  if (!inside(to)) return null;
  const a = list[i], moved = { ...a, col: to.col, row: to.row };
  const rest = list.map((x, j) => ({ x, j })).filter(({ j }) => j !== i);
  const hits = rest.filter(({ x }) => hit(x, moved));
  const put = (m: Map<number, W>) => list.map((x, j) => (j === i ? moved : m.get(j) ?? x));
  if (!hits.length) return put(new Map());
  const dc = moved.col - a.col, dr = moved.row - a.row, still = rest.filter(({ x }) => !hit(x, moved)).map(({ x }) => x);
  const ok = (x: W, placed: W[]) => inside(x) && !hit(x, moved) && !still.some((o) => hit(o, x)) && !placed.some((o) => hit(o, x));
  const mirror = new Map<number, W>(), mp: W[] = [];
  for (const { x, j } of hits) { const t = { ...x, col: x.col - dc, row: x.row - dr }; if (!ok(t, mp)) break; mirror.set(j, t); mp.push(t); }
  if (mirror.size === hits.length) return put(mirror);
  const near = new Map<number, W>(), placed: W[] = [];
  for (const { x, j } of [...hits].sort((p, q) => q.x.w * q.x.h - p.x.w * p.x.h)) {
    const want = { col: x.col - dc, row: x.row - dr };
    let best: W | null = null, bd = 1e9;
    for (let r = 0; r <= ROWS - x.h; r++) for (let c = 0; c <= COLS - x.w; c++) {
      const t = { ...x, col: c, row: r };
      if (!ok(t, placed)) continue;
      const d = Math.abs(c - want.col) + Math.abs(r - want.row);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) return null;
    near.set(j, best); placed.push(best);
  }
  return put(near);
}

import type { Spec, Widget } from "./display/render";
import { buttonsOf, type Proto } from "./layoutModel";
import art from "./assets/sample-art.png";

// Made-up data so each widget in the Widgets column is drawn the way it looks on the Push, whatever is playing or running.
const ROW = (label: string, pct: number, sub: string, kind = "limit", color = "provider") => ({ label, kind, pct, sub, color });
const COLORS: Record<string, string> = { claude: "#d97757", codex: "#10a37f" };

// The made-up player (widget + its buttons) at a column, so the picture of the device shows the same card as the Widgets column.
export function playerSample(col: number, size: number) {
  const widget: Widget = { type: "now_playing", col, row: 0, w: size, h: 2, title: "Golden Hour", artist: "Juniper Lane", art, progress: 0.38, elapsed: "1:24", total: "3:42", playing: true, tint: "#ff7a59", tint2: "#ffc15a", volume: size >= 4 ? 64 : undefined };
  const zones: Spec["zones"] = {}, b = buttonsOf({ type: "player", col, row: 0, w: size, h: 2 });
  b?.up.forEach((x, i) => { if (x.label) zones[`btn-upper-${col + i + 1}`] = { label: x.label, icon: x.icon }; });
  b?.down.forEach((x, i) => { if (x.label) zones[`btn-lower-${col + i + 1}`] = { label: x.label, icon: x.icon }; });
  return { widget, zones };
}
export type Look = { bar: string; mascot: string };
export const THEMES: Record<string, Look> = { neon: { bar: "neon", mascot: "pixel" }, plasma: { bar: "plasma", mascot: "pip" }, classic: { bar: "classic", mascot: "classic" } };   // Claude widget theme -> bar + mascot (as in layout.py)
export function sampleSpec(p: Proto, info: { name: string; accent: string; icon: string }, look: Look = { bar: "neon", mascot: "pip" }): Spec {
  const base = p.make();
  const zones: Spec["zones"] = {};
  let wd: Widget;
  if (base.type === "player") {
    wd = playerSample(0, base.w).widget;
  } else if (base.type === "profile") wd = { ...base, name: info.name, mode: "", accent: info.accent, icon: info.icon };
  else if (base.type === "clock") { const n = new Date(); wd = { ...base, time: n.toTimeString().slice(0, 5), date: n.toLocaleDateString("en-GB", { weekday: base.w < 3 ? "short" : "long", day: "2-digit", month: "short" }).replace(",", "") }; }
  else if (base.type === "claude_session") wd = { ...base, title: "Ableton Push control system", state: "working", elapsed: "2m", action: "Editing a file", step_elapsed: "1m 07s", reply: "Moving the player into the layout as a widget, so it can sit anywhere, resize between 2x2 and 4x2, and keep its buttons with it.", todo_done: 3, todo_total: 6, todo_active: "Wire up the timer", todo_states: "cccapp", todo_live: true, steps: 9, activity: "edit", agents: 2, app: "desktop", host: "local", mode: "code", bar: look.bar, mascot: look.mascot };
  else if (base.type === "browser") wd = { ...base, title: "Design review", host: "figma.com", idle: false, loading: false, secure: true, saved: true, n_saved: 3, mono: "F", hue: "#c58bff", icon: "", pop: null, page: 0, pages: 1, favs: ["Design review", "Notion workspace", "GitHub pull requests", "YouTube", "Linear issues"].map((t, i) => ({ icon: "", mono: t[0], hue: ["#c58bff", "#f5c542", "#6aa7ff", "#ff7a59", "#7ed37f"][i], title: t, open: i === 1 })), dl: { active: true, done: false, name: "brand-kit.zip", size: "48.2 MB", speed: "3.1 MB/s" } };
  else if (base.type === "download") wd = { ...base, dl: { active: true, done: false, name: "brand-kit.zip", size: "48.2 MB", speed: "3.1 MB/s" } };
  else if (base.type === "tab") wd = { ...base, title: "Design review", host: "figma.com", icon: "", idle: false };
  else {
    const prov = String(base.provider), which = String(base.which), claude = prov === "claude";
    const rows = [] as ReturnType<typeof ROW>[];
    if (claude && (base.context || which === "context")) rows.push(ROW("Context", 42, "84k / 200k", "context", "info"));
    if (which === "both") rows.push(ROW("5-hour", 38, "in 2h 10m"), ROW("Weekly", 61, "in 3d 4h"));
    else if (which === "five_hour") rows.push(ROW("5-hour", 38, base.h > 1 ? "resets in 2h 10m" : "in 2h 10m"));
    else if (which === "seven_day") rows.push(ROW("Weekly", 61, "resets in 3d 4h"));
    const last = rows[rows.length - 1];
    wd = { ...base, provider: claude ? "Claude" : "Codex", provider_color: COLORS[prov], plan: claude ? "Max" : "", rows, caption: last.label, pct: last.pct, sub: last.sub, color: last.kind === "context" ? "info" : "good" };
  }
  if (wd.type === "usage" || wd.type === "clock") wd = { ...wd, mascot: look.mascot };
  const b = buttonsOf(base);   // the buttons this widget brings: shown above / below it as on the Push
  if (b) {
    b.up.forEach((x, i) => { if (x.label) zones[`btn-upper-${i + 1}`] = { label: x.label, icon: x.icon }; });
    b.down.forEach((x, i) => { if (x.label) zones[`btn-lower-${i + 1}`] = { label: x.label, icon: x.icon }; });
  }
  return { accent: info.accent, zones, active: [], widgets: [wd], toast: null, view: "full" };
}

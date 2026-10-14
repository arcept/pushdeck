import type { Profile } from "./daemon";
import { isGlobalPad, uniqueId } from "./model";

// The shareable profile file: the profile itself plus a format tag, so other people's files can be recognised and checked.
export const FORMAT = "push-profile", SCHEMA = 1;
export const AUTHOR_KEY = "push-ui-author";
export const myAuthor = (): string => { try { return localStorage.getItem(AUTHOR_KEY) ?? ""; } catch { return ""; } };
export const rememberAuthor = (n: string) => { try { localStorage.setItem(AUTHOR_KEY, n); } catch { /* storage unavailable */ } };

export const today = () => new Date().toISOString();
export const fmtDate = (iso?: string) => { const t = iso ? new Date(iso) : null; return t && !isNaN(+t) ? t.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""; };

export const fmtTime = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");

export function toFile(p: Profile) {
  const { slot: _slot, source: _source, ...rest } = p; void _slot; void _source;
  rest.controls = Object.fromEntries(Object.entries(rest.controls).filter(([id]) => !isGlobalPad(id))); // global pads belong to the device, not the profile
  return { format: FORMAT, schema_version: SCHEMA, exported_at: today(), ...rest };
}

// Only web addresses are ever shown as links.
export const safeUrl = (u?: string): string | undefined => { try { const x = new URL(u ?? ""); return x.protocol === "http:" || x.protocol === "https:" ? x.href : undefined; } catch { return undefined; } };

export function downloadProfile(p: Profile) {
  const blob = new Blob([JSON.stringify(toFile(p), null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${p.id}.push-profile.json`; a.click(); URL.revokeObjectURL(a.href);
}

export const sourceLine = (p: Pick<Profile, "source" | "created">) => {
  const s = p.source;
  if (s?.kind === "imported") return `Imported ${fmtDate(s.imported_at)}${s.file ? ` from ${s.file}` : ""}${s.author ? `, made by ${s.author}` : ""}`;
  if (s?.kind === "bundled") return "Comes with the app";
  return p.created ? `Created by you on ${fmtDate(p.created)}` : "Created by you";
};

export type Risks = { shell: string[]; url: string[]; app: string[]; text: string[]; keys: number; other: number };
export function risksOf(p: Profile): Risks {
  const r: Risks = { shell: [], url: [], app: [], text: [], keys: 0, other: 0 };
  for (const c of Object.values(p.controls)) {
    const a = c.action; if (!a) continue;
    if (a.type === "shell") r.shell.push(String(a.command ?? ""));
    else if (a.type === "url") r.url.push(String(a.url ?? ""));
    else if (a.type === "app") r.app.push(String(a.name ?? ""));
    else if (a.type === "text") r.text.push(String(a.text ?? ""));
    else if (a.type === "keys") r.keys++;
    else r.other++;
  }
  return r;
}

export type Parsed = { profile: Profile; file: string; dropped: number; sharedPads: number; newer: boolean; risks: Risks };

// Reads a profile file and returns a cleaned copy plus what to tell the person before it is added.
export function parseProfile(text: string, file: string, knownControls: Set<string>): Parsed {
  if (text.length > 2_000_000) throw new Error("That file is over 2 MB, too big for a profile.");
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  if (!raw || typeof raw !== "object" || typeof raw.name !== "string" || typeof raw.controls !== "object" || !raw.controls)
    throw new Error("That doesn't look like a Push profile. It needs a name and a list of controls.");
  if (raw.format !== undefined && raw.format !== FORMAT) throw new Error("That file is a different kind of file, not a Push profile.");
  const p = raw as unknown as Profile & { format?: string; schema_version?: number; exported_at?: string };
  const controls: Profile["controls"] = {}; let dropped = 0, sharedPads = 0;
  for (const [id, c] of Object.entries(p.controls)) { if (isGlobalPad(id)) { sharedPads++; continue; } if (knownControls.has(id) && c && typeof c === "object") controls[id] = c; else dropped++; }
  const accent = /^#[0-9a-f]{6}$/i.test(p.theme?.accent ?? "") ? p.theme.accent : "#d97757";
  const icon = p.icon?.type === "image" ? (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.icon.data) && p.icon.data.length < 200_000 ? p.icon : undefined)
    : p.icon?.type === "glyph" || p.icon?.type === "app" ? p.icon : undefined;
  const clean: Profile = {
    id: String(p.id || p.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profile",
    name: p.name.slice(0, 60), match: { bundle_ids: Array.isArray(p.match?.bundle_ids) ? p.match.bundle_ids.filter((b) => typeof b === "string") : [] },
    theme: { accent, bg: "#000000" }, controls, ...(icon ? { icon } : {}),
    ...(p.display ? { display: p.display } : {}),
    ...(p.author?.name ? { author: { name: String(p.author.name).slice(0, 60), ...(safeUrl(p.author.url) ? { url: safeUrl(p.author.url) } : {}) } } : {}),
    ...(typeof p.description === "string" ? { description: p.description.slice(0, 200) } : {}),
    ...(typeof p.created === "string" ? { created: p.created } : {}),
  };
  return { profile: clean, file, dropped, sharedPads, newer: (p.schema_version ?? 1) > SCHEMA, risks: risksOf(clean) };
}

export function importedCopy(parsed: Parsed, existing: Profile[], replace: boolean): Profile {
  const p = { ...parsed.profile };
  const source = { kind: "imported" as const, imported_at: today(), file: parsed.file, ...(p.author?.name ? { author: p.author.name } : {}) };
  if (replace) { const old = existing.find((e) => e.id === p.id); return { ...p, ...(old?.slot !== undefined ? { slot: old.slot } : {}), source }; }
  const names = existing.map((e) => e.name);
  if (names.includes(p.name)) p.name = `${p.name} (imported)`;
  return { ...p, id: uniqueId(p.id, existing.map((e) => e.id)), source };
}

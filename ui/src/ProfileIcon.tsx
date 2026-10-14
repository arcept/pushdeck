import { useState } from "react";
import type { Profile } from "./daemon";

// Abstract glyphs a profile can wear. Drawn on a 24x24 grid, filled with the profile's colour.
import GLYPH_SVG from "./display/glyphs.json";   // one list for the browser and the daemon (which draws the same glyphs on the Push screen)
export const GLYPHS = GLYPH_SVG as Record<string, string>;
export const GLYPH_NAMES = Object.keys(GLYPHS);

const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export const autoGlyph = (id: string) => GLYPH_NAMES[hash(id) % GLYPH_NAMES.length];

export function Glyph({ name, size, color }: { name: string; size: number; color: string }) {
  return <span className="glyphtile" style={{ width: size, height: size, color, background: `color-mix(in srgb, ${color} 16%, #14151a)` }}>
    <svg viewBox="0 0 24 24" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} fill="currentColor" aria-hidden="true" dangerouslySetInnerHTML={{ __html: GLYPHS[name] ?? GLYPHS.orbit }} />
  </span>;
}

// The icon a profile wears. Its own choice if it has one; otherwise the icon of the first app that switches it on
// (fetched from the Mac); otherwise an abstract glyph picked from its id so every profile still looks distinct.
export default function ProfileIcon({ profile, size = 20 }: { profile: Pick<Profile, "id" | "icon" | "theme" | "match">; size?: number }) {
  const ic = profile.icon;
  const [bad, setBad] = useState<string | null>(null);
  const glyph = ic?.type === "glyph" ? ic.name : autoGlyph(profile.id);
  const bundle = ic?.type === "app" ? ic.bundle : !ic ? profile.match.bundle_ids[0] : undefined;
  if (ic?.type === "image") return <img className="profimg" width={size} height={size} src={ic.data} alt="" />;
  if (bundle && bad !== bundle) return <img className="profimg" width={size} height={size} src={`/api/app-icon/${encodeURIComponent(bundle)}`} alt="" onError={() => setBad(bundle)} />;
  return <Glyph name={glyph} size={size} color={profile.theme.accent} />;
}

const tile = (c: string) => { const n = parseInt(c.replace("#", "").padEnd(6, "0").slice(0, 6), 16), bg = [0x14, 0x15, 0x1a]; return "#" + [n >> 16, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v * 0.16 + bg[i] * 0.84).toString(16).padStart(2, "0")).join(""); };
// A picture URL for a profile's icon (what the display's canvas and the widget samples load), same rule as ProfileIcon above.
export function iconSrc(profile: Pick<Profile, "id" | "icon" | "theme" | "match">): string {
  const ic = profile.icon;
  if (ic?.type === "image") return ic.data;
  const bundle = ic?.type === "app" ? ic.bundle : !ic ? profile.match.bundle_ids[0] : undefined;
  if (bundle) return `/api/app-icon/${encodeURIComponent(bundle)}`;
  const c = profile.theme.accent, g = (ic?.type === "glyph" ? ic.name : autoGlyph(profile.id));
  return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="36" fill="${tile(c)}"/><g transform="translate(24.3 24.3) scale(3.31)" fill="${c}" color="${c}">${GLYPHS[g] ?? GLYPHS.orbit}</g></svg>`);
}

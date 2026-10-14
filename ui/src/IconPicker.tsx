import { useRef, useState } from "react";
import { useApp } from "./ctx";
import { Icon } from "./icons";
import { AppIcon } from "./Apps";
import ProfileIcon, { GLYPH_NAMES, Glyph } from "./ProfileIcon";
import type { ProfileIconSpec } from "./daemon";
import { useToast } from "./ui";

const SIZE = 128, MAX_BYTES = 8 * 1024 * 1024;

// Any picture the browser can read becomes a square 128 x 128 PNG (centre-cropped), stored inside the profile file so it travels with it.
async function toSquarePng(file: File): Promise<{ data: string; from: [number, number] }> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a picture file. Use PNG, JPG, SVG, WebP or GIF.");
  if (file.size > MAX_BYTES) throw new Error("That file is over 8 MB. Pick a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("The browser couldn't read that image.")); i.src = url; });
    const w = img.naturalWidth || SIZE, h = img.naturalHeight || SIZE, s = Math.min(w, h);
    const c = document.createElement("canvas"); c.width = c.height = SIZE;
    const g = c.getContext("2d")!; g.imageSmoothingQuality = "high";
    g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, SIZE, SIZE);
    return { data: c.toDataURL("image/png"), from: [w, h] };
  } finally { URL.revokeObjectURL(url); }
}

export default function IconPicker() {
  const { profile, updateProfile } = useApp();
  const [open, setOpen] = useState(false), [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  if (!profile) return null;
  const ic = profile.icon, bundles = profile.match.bundle_ids;
  const set = (i: ProfileIconSpec | undefined) => updateProfile({ icon: i });
  const take = async (f?: File) => {
    if (!f) return;
    try {
      const { data, from } = await toSquarePng(f);
      set({ type: "image", data });
      const note = from[0] !== from[1] ? "cropped to a square and " : "";
      toast(from[0] === SIZE && from[1] === SIZE ? "Icon set" : `Icon set (${note}resized from ${from[0]} × ${from[1]} to ${SIZE} × ${SIZE})`, "good");
    } catch (e) { toast((e as Error).message, "bad"); }
  };
  const same = (a?: ProfileIconSpec, b?: ProfileIconSpec) => JSON.stringify(a) === JSON.stringify(b);
  return (
    <div className="field">
      <span className="lab">Icon</span>
      <div className="iconrow">
        <ProfileIcon profile={profile} size={44} />
        <div className="iconwhat"><b>{!ic ? "Automatic" : ic.type === "image" ? "Your picture" : ic.type === "app" ? "App icon" : "Abstract"}</b>
          <span>{!ic ? "The app's own icon" : "Shown by its name"}</span></div>
        <button className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Done" : "Change"}</button>
      </div>
      {open && (
        <div className="iconpanel">
          <div className="iconsec"><span className="lab2">Automatic</span>
            <button className="icontile wide" aria-pressed={!ic} onClick={() => set(undefined)}><ProfileIcon profile={{ ...profile, icon: undefined }} size={28} /><span>Use the app's own icon</span></button></div>
          {bundles.length > 0 && <div className="iconsec"><span className="lab2">From this profile's apps</span>
            <div className="icongrid">{bundles.map((b) => { const spec: ProfileIconSpec = { type: "app", bundle: b }; return <button key={b} className="icontile" aria-pressed={same(ic, spec)} title={b} onClick={() => set(spec)}><AppIcon bundle={b} size={30} /></button>; })}</div></div>}
          <div className="iconsec"><span className="lab2">Abstract shapes</span>
            <div className="icongrid">{GLYPH_NAMES.map((n) => { const spec: ProfileIconSpec = { type: "glyph", name: n }; return <button key={n} className="icontile" aria-label={n} aria-pressed={same(ic, spec)} onClick={() => set(spec)}><Glyph name={n} size={30} color={profile.theme.accent} /></button>; })}</div></div>
          <div className="iconsec"><span className="lab2">Your own picture</span>
            <div className={`dropzone ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]); }}>
              <button className="btn sm" onClick={() => file.current?.click()}><Icon name="upload" size={14} />Choose a file</button>
              <span>or drop one here</span>
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <ul className="iconrules">
              <li><b>Best:</b> a square PNG or SVG, 128 × 128 px or larger, with a transparent background.</li>
              <li><b>Also fine:</b> JPG, WebP or GIF, up to 8 MB.</li>
              <li>Other shapes and sizes are cropped to a square and resized to 128 × 128 for you.</li>
              <li>Mac <code>.icns</code> files aren't supported. Export the logo as PNG first.</li>
            </ul>
            {ic?.type === "image" && <button className="btn ghost sm" onClick={() => set(undefined)}>Remove my picture</button>}
          </div>
        </div>
      )}
    </div>
  );
}

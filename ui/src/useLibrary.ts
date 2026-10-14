import { useRef, type RefObject } from "react";
import { useApp } from "./ctx";
import { PALETTE, uniqueId } from "./model";
import type { Profile } from "./daemon";
import { useToast } from "./ui";
import { importProfileFile } from "./ImportDialog";
import { myAuthor, today } from "./profileFile";

// Creating and importing profiles (the dropdown in the top bar owns these). A new profile goes onto the Push and into the editor.
export function useLibrary(): { create: () => void; importFile: (f?: File) => Promise<void>; file: RefObject<HTMLInputElement> } {
  const { d, setCurrent } = useApp();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const taken = d.profiles.map((p) => p.id);
  const show = (p: Profile) => { d.send({ type: "save_profile", profile: p }); setCurrent(p.id); };
  const create = () => {
    const name = "New profile";
    const me = myAuthor();
    show({ id: uniqueId(name, taken), name, created: today(), source: { kind: "created" }, ...(me ? { author: { name: me } } : {}), match: { bundle_ids: [] }, theme: { accent: PALETTE[d.profiles.length % PALETTE.length], bg: "#000000" }, controls: {} });
  };
  // Importing opens a preview first (ImportDialog); nothing is added until the person confirms.
  const importFile = async (f?: File) => { if (f) importProfileFile(f); };
  return { create, importFile, file };
}

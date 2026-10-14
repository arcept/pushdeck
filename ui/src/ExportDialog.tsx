import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { Icon } from "./icons";
import ProfileIcon from "./ProfileIcon";
import type { Profile } from "./daemon";
import { downloadProfile, myAuthor, rememberAuthor, safeUrl } from "./profileFile";
import { Field, useDialog, useToast } from "./ui";

export const exportProfileDialog = (id: string) => window.dispatchEvent(new CustomEvent("push-export", { detail: id }));

// Sharing is where you say who made a profile: the name, link and description are saved with it and shown to whoever imports it.
export default function ExportDialog() {
  const { d, profile: current, updateProfile } = useApp();
  const dlg = useDialog(), toast = useToast();
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState(""), [url, setUrl] = useState(""), [desc, setDesc] = useState("");
  const target = d.profiles.find((p) => p.id === id) ?? (current?.id === id ? current : undefined);
  const p = current?.id === id ? current : target;

  useEffect(() => {
    const on = (e: Event) => {
      const pid = (e as CustomEvent<string>).detail, q = (current?.id === pid ? current : d.profiles.find((x) => x.id === pid));
      if (!q) return;
      setId(pid); setName(q.author?.name ?? myAuthor()); setUrl(q.author?.url ?? ""); setDesc(q.description ?? ""); dlg.show();
    };
    window.addEventListener("push-export", on); return () => window.removeEventListener("push-export", on);
  }, [d.profiles, current, dlg.show]); // eslint-disable-line
  useEffect(() => { const el = dlg.ref.current; if (!el) return; const h = (e: MouseEvent) => { if (e.target === el) dlg.close(); }; el.addEventListener("mousedown", h); return () => el.removeEventListener("mousedown", h); }, [dlg]);

  const link = url.trim() ? safeUrl(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : undefined;
  const bad = !!url.trim() && !link;
  const go = () => {
    if (!p || bad) return;
    const n = name.trim(), meta = {
      author: n ? { name: n, ...(link ? { url: link } : {}) } : undefined,
      description: desc.trim() || undefined,
    };
    if (n) rememberAuthor(n);
    const next: Profile = { ...p, ...meta };
    if (current?.id === p.id) updateProfile(meta); else d.send({ type: "save_profile", profile: next });
    downloadProfile(next); dlg.close(); toast(`Exported “${p.name}”`, "good");
  };

  return (
    <dialog ref={dlg.ref} className="modal" aria-label="Export a profile">
      {p && <div className="modalbody">
        <div className="imphead"><ProfileIcon profile={p} size={44} /><div><h2>Share “{p.name}”</h2><span className="muted">Saved as one file you can send to anyone.</span></div></div>
        <p className="aboutp" style={{ margin: 0 }}>Say who made it. This is saved with the profile and shown to whoever imports it. Everything here is optional.</p>
        <Field label="Your name"><input type="text" maxLength={60} value={name} placeholder="Author name" autoFocus onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Your link" hint={bad ? "That doesn't look like a web address." : "A website or profile page."}><input type="text" inputMode="url" maxLength={200} value={url} placeholder="example.com" aria-invalid={bad} onChange={(e) => setUrl(e.target.value)} /></Field>
        <Field label="Description"><textarea rows={3} maxLength={200} value={desc} placeholder="What it is for, in a sentence" onChange={(e) => setDesc(e.target.value)} /></Field>
        <div className="modalfoot"><button className="btn" onClick={dlg.close}>Cancel</button><button className="btn primary" onClick={go} disabled={bad}><Icon name="download" size={15} />Save and export</button></div>
      </div>}
    </dialog>
  );
}

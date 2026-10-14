import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { Icon } from "./icons";
import { AppIcon, useAppInfo } from "./Apps";
import ProfileIcon from "./ProfileIcon";
import { importedCopy, parseProfile, safeUrl, type Parsed } from "./profileFile";
import { useDialog, useToast } from "./ui";

export const importProfileFile = (f: File) => window.dispatchEvent(new CustomEvent("push-import", { detail: f }));

function AppLine({ bundle }: { bundle: string }) {
  const i = useAppInfo(bundle);
  return <span className="applabel"><AppIcon bundle={bundle} size={18} />{i?.installed ? i.name : bundle}{i && !i.installed && <em>not installed</em>}</span>;
}

// Importing never applies a profile straight away: it opens a preview with who made it, what it switches on for, and what it can run.
export default function ImportDialog() {
  const { d, setCurrent } = useApp();
  const dlg = useDialog(), toast = useToast();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mode, setMode] = useState<"both" | "replace">("both");
  const [showCmds, setShowCmds] = useState(false);

  useEffect(() => {
    const on = async (e: Event) => {
      const f = (e as CustomEvent<File>).detail;
      try {
        const p = parseProfile(await f.text(), f.name, new Set(Object.keys(d.controls)));
        setParsed(p); setMode("both"); setShowCmds(false); dlg.show();
      } catch (err) { toast((err as Error).message, "bad"); }
    };
    window.addEventListener("push-import", on); return () => window.removeEventListener("push-import", on);
  }, [d.controls, dlg.show]); // eslint-disable-line
  useEffect(() => { const el = dlg.ref.current; if (!el) return; const h = (e: MouseEvent) => { if (e.target === el) dlg.close(); }; el.addEventListener("mousedown", h); return () => el.removeEventListener("mousedown", h); }, [dlg]);

  const p = parsed?.profile, clash = !!p && d.profiles.some((e) => e.id === p.id);
  const add = () => {
    if (!parsed) return;
    const out = importedCopy(parsed, d.profiles, clash && mode === "replace");
    d.send({ type: "save_profile", profile: out }); setCurrent(out.id); dlg.close();
    toast(`Added “${out.name}” to your library`, "good");
  };
  const r = parsed?.risks, n = p ? Object.keys(p.controls).length : 0;

  return (
    <dialog ref={dlg.ref} className="modal" aria-label="Import a profile">
      {p && r && parsed && <div className="modalbody">
        <div className="imphead"><ProfileIcon profile={p} size={44} />
          <div><h2>{p.name}</h2><span className="muted">{p.author?.name ? `by ${p.author.name}` : "Author not stated"}</span>{safeUrl(p.author?.url) && <a className="authlink" href={safeUrl(p.author?.url)} target="_blank" rel="noreferrer">{new URL(safeUrl(p.author?.url)!).hostname.replace(/^www\./, "")}</a>}</div></div>
        {p.description && <p className="impdesc">{p.description}</p>}
        <dl className="impmeta">
          <dt>Turns on in</dt><dd>{p.match.bundle_ids.length ? p.match.bundle_ids.map((b) => <AppLine key={b} bundle={b} />) : <span className="muted">No apps. You make it master or press its scene button.</span>}</dd>
          <dt>Sets up</dt><dd>{n} {n === 1 ? "control" : "controls"}{parsed.dropped > 0 && <span className="muted"> · {parsed.dropped} unknown {parsed.dropped === 1 ? "control" : "controls"} skipped</span>}{parsed.sharedPads > 0 && <span className="muted"> · {parsed.sharedPads} in the Global pad column left out, since those are shared by every profile</span>}</dd>
          <dt>From file</dt><dd className="mono">{parsed.file}</dd>
        </dl>
        {r.shell.length > 0 && <div className="risk bad"><Icon name="terminal" size={16} /><div><b>Runs {r.shell.length} shell {r.shell.length === 1 ? "command" : "commands"} on your Mac.</b> Only add this if you trust who made it.
          <button className="linkbtn" onClick={() => setShowCmds(!showCmds)}>{showCmds ? "Hide" : "Show"} {r.shell.length === 1 ? "it" : "them"}</button>
          {showCmds && <ul className="cmds">{r.shell.map((c, i) => <li key={i}><code>{c}</code></li>)}</ul>}</div></div>}
        {(r.url.length > 0 || r.app.length > 0 || r.text.length > 0) && <div className="risk"><Icon name="info" size={16} /><div>
          {[r.app.length && `opens ${r.app.length} ${r.app.length === 1 ? "app" : "apps"}`, r.url.length && `opens ${r.url.length} ${r.url.length === 1 ? "web address" : "web addresses"}`, r.text.length && `types text in ${r.text.length} ${r.text.length === 1 ? "place" : "places"}`].filter(Boolean).join(", ").replace(/^./, (c) => c.toUpperCase())}. Every control you see is listed in the profile after you add it.</div></div>}
        {parsed.newer && <div className="risk"><Icon name="info" size={16} /><div>Made with a newer version of this app. Some of it may not work.</div></div>}
        {clash && <fieldset className="clash"><legend>You already have a profile with this ID</legend>
          <label><input type="radio" name="m" checked={mode === "both"} onChange={() => setMode("both")} />Keep both. The imported one gets a new name.</label>
          <label><input type="radio" name="m" checked={mode === "replace"} onChange={() => setMode("replace")} />Replace “{d.profiles.find((e) => e.id === p.id)?.name}”.</label></fieldset>}
        <div className="modalfoot"><button className="btn" onClick={dlg.close}>Cancel</button><button className="btn primary" onClick={add}><Icon name="plus" size={15} />Add to library</button></div>
      </div>}
    </dialog>
  );
}

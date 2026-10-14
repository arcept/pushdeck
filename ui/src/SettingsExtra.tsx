import { useRef } from "react";
import { useApp } from "./ctx";
import { Icon } from "./icons";
import ProfileIcon from "./ProfileIcon";
import { importProfileFile } from "./ImportDialog";
import { sourceLine } from "./profileFile";
import { exportProfileDialog } from "./ExportDialog";
import { sceneIndex, sceneName } from "./model";

// Placeholder until the public repository exists
export const REPO = "https://github.com/arcept/pushdeck";

// Settings → Profiles: the whole library in one list, with import and export.
export function ProfilesPage({ close }: { close: () => void }) {
  const { d, setCurrent } = useApp();
  const file = useRef<HTMLInputElement>(null);
  return (<>
    <h2>Profiles</h2><p className="lead">Everything in your library. Import profiles other people made, or export yours to share.</p>
    <div className="row wrap" style={{ marginBottom: 16 }}>
      <button className="btn primary" onClick={() => file.current?.click()}><Icon name="upload" size={15} />Import a profile</button>
      <a className="btn" href={`${REPO}/tree/main/profiles`} target="_blank" rel="noreferrer"><Icon name="globe" size={15} />Find more profiles</a>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { if (e.target.files?.[0]) { close(); importProfileFile(e.target.files[0]); } e.target.value = ""; }} />
    </div>
    <div className="libtable">
      {d.profiles.map((p) => { const si = sceneIndex(d.profiles, p.id); return (
        <div key={p.id} className="librow">
          <ProfileIcon profile={p} size={36} />
          <div className="libinfo"><b>{p.name}</b>
            <span>{p.author?.name ? `By ${p.author.name}` : "No author"} · {sourceLine(p)}</span>
            <span>{si >= 0 ? sceneName(si) : "Not on a scene button"} · {p.match.bundle_ids.length} {p.match.bundle_ids.length === 1 ? "app" : "apps"}</span></div>
          <button className="btn sm" onClick={() => { setCurrent(p.id); close(); }}>Edit</button>
          <button className="btn sm icon" aria-label={`Export ${p.name}`} title="Export to share" onClick={() => exportProfileDialog(p.id)}><Icon name="download" size={14} /></button>
        </div>); })}
    </div>
  </>);
}

const KEYS: [string, string][] = [["⌘K", "Search profiles, controls, tests and settings"], ["⌘Z", "Undo the last change to a profile"], ["Esc", "Close a panel or menu"], ["Enter on an action chip", "Add it to the selected pad or button"]];

// Settings → About: how it fits together, shortcuts, credits.
export function AboutPage({ close }: { close: () => void }) {
  return (<>
    <h2>About</h2><p className="lead">How Push Deck fits together.</p>
    <section className="setgroup"><h3>How profiles work</h3>
      <p className="aboutp">A <b>profile</b> is a set of pad, button and display setups for one job, like Figma or Claude Code. Your Push uses one profile at a time.</p>
      <p className="aboutp">With <b>Auto</b>, the Push switches profile when you switch app. Press one of the 8 <b>scene buttons</b> beside the pads to pick a profile by hand, or choose <b>Master</b> in the left column to hold a profile whatever app is in front. You can also press the <b>Master</b> button on the Push, then a profile button.</p>
      <p className="aboutp">The left column edits the profile you picked at the top. The right column edits the one pad, button or knob you selected. Knob functions like volume work in every profile.</p>
      <button className="btn" onClick={() => { close(); window.dispatchEvent(new Event("push-intro")); }}><Icon name="eye" size={15} />Show the quick tour</button></section>
    <section className="setgroup"><h3>Keyboard shortcuts</h3>
      {KEYS.map(([k, t]) => <div key={k} className="trow"><div className="t">{t}</div><span className="kbd">{k}</span></div>)}</section>
    <section className="setgroup"><h3>Credits</h3>
      <p className="aboutp">Designed and developed by <b>Arcept</b>.</p>
      <div className="row wrap"><a className="btn sm" href={REPO} target="_blank" rel="noreferrer"><Icon name="globe" size={14} />GitHub</a><a className="btn sm" href={`${REPO}/issues`} target="_blank" rel="noreferrer"><Icon name="alert" size={14} />Report an issue</a></div>
      <p className="hint" style={{ marginTop: 12 }}>Ableton and Push are trademarks of Ableton AG. This project is independent and is not affiliated with or endorsed by Ableton.</p></section>
  </>);
}

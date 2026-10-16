import { useRef, useState } from "react";
import { Icon } from "./icons";
import { useApp } from "./ctx";
import { useWindowPads } from "./WindowPads";
import { PALETTE, WINDOW_PAD_IDS, windowOn, colourName, isGlobalPad, sceneIndex, sceneName, summarize, uniqueId } from "./model";
import ProfileIcon from "./ProfileIcon";
import IconPicker from "./IconPicker";
import { fmtTime, safeUrl, sourceLine, today } from "./profileFile";
import { exportProfileDialog } from "./ExportDialog";
import { importProfileFile } from "./ImportDialog";
import { AppIcon, AppRow, useAppInfo } from "./Apps";
import { AnchoredPopover, ConfirmButton, CustomColour, Field, Seg, Switch, Tip, useToast } from "./ui";
import ProfileMenu from "./ProfileMenu";

function FrontApp({ bundle, onAdd }: { bundle: string; onAdd: () => void }) {
  const info = useAppInfo(bundle);
  return <button className="btn block addfront" onClick={onAdd}><AppIcon bundle={bundle} size={18} /><span>Add {info?.installed ? info.name : bundle}<span className="muted"> · the app in front now</span></span></button>;
}

// Left column: edits the profile chosen in the top bar. The right column edits one control of it.
export default function ProfileRail() {
  const { d, profile, updateProfile, setCurrent, saveState, savedAt, undo, canUndo, revert, canRevert, selected, setSelected, setSceneHl } = useApp();
  const [bundle, setBundle] = useState(""); const importer = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const wp = useWindowPads();
  if (!profile) return <nav className="rail" aria-label="Profile"><div className="tips"><h2>No profile</h2>Create or import one from the profile menu in the top bar.</div></nav>;

  const front = d.active.front, ids = profile.match.bundle_ids, disp = profile.display ?? {};
  const addApp = (b: string) => { b = b.trim(); if (b && !ids.includes(b)) updateProfile({ match: { bundle_ids: [...ids, b] } }); setBundle(""); };
  const sceneIdx = sceneIndex(d.profiles, profile.id), locked = d.active.pinned === profile.id, lockedElsewhere = d.active.pinned && !locked ? d.profiles.find((p) => p.id === d.active.pinned) : undefined;
  const exportFile = () => exportProfileDialog(profile.id);
  const duplicate = () => {
    const copy = { ...structuredClone(profile), created: today(), source: { kind: "created" as const }, id: uniqueId(profile.name + " copy", d.profiles.map((p) => p.id)), name: profile.name + " copy" } as typeof profile;
    delete copy.slot; d.send({ type: "save_profile", profile: copy }); setCurrent(copy.id); toast("Duplicated", "good");
  };
  const assigned = Object.entries(profile.controls).filter(([id, c]) => (c.label || c.action || c.color) && !(WINDOW_PAD_IDS.includes(id) && windowOn(d.settings, profile))).map(([id, c]) => ({ id, c, name: (d.controls[id]?.name ?? id) + (isGlobalPad(id) ? " · global" : "") }));
  const buttons = assigned.filter((x) => !x.id.startsWith("pad-")), pads = assigned.filter((x) => x.id.startsWith("pad-"));
  const row = (x: (typeof assigned)[number]) => (
    <button key={x.id} className="arow" aria-current={selected === x.id} onClick={() => setSelected(x.id)}>
      <span className="adot" style={{ background: x.c.color ?? "var(--tx3)" }} />
      <span className="aname">{x.c.label || x.name}</span>
      <span className="asub">{x.c.action ? summarize(x.c.action) : x.name}</span>
    </button>);

  return (
    <nav className="rail" aria-label="Edit profile">
      <div className="head">
        <div className="coltitle"><b>Profile</b><span>Name, colour, icon, apps</span></div>
        <AnchoredPopover trigger={({ toggle, open }) => (
          <button className="phead pswitch" onClick={toggle} aria-haspopup="listbox" aria-expanded={open} aria-label={`${profile.name}. Change profile`}>
            <ProfileIcon profile={profile} size={34} /><h2>{profile.name}</h2><span className="pcaret"><Icon name="down" size={18} /></span>
          </button>)}>
          {(close) => <ProfileMenu close={close} />}
        </AnchoredPopover>
        <div className="id">
          {d.active.active === profile.id && <Tip align="left" title="Active profile on your Push" desc="This is the profile the Push is showing and using right now."><span className="chipbadge live"><Icon name="activity" size={12} />Active profile on your Push</span></Tip>}
        </div>
        <div className="moderow">
          <span className="modelab">Switch profiles</span>
          <Tip align="right" title="Auto or Master" desc="Auto follows the app in front. Master keeps this profile on the Push whichever app is in front.">
            <span className="modeseg"><Seg label="Switch profiles" value={locked ? "master" : d.active.pinned ? "other" : "auto"} onChange={(v) => d.send({ type: "set_profile", id: v === "master" ? profile.id : null })}
              options={[{ value: "auto", label: "Auto" }, { value: "master", label: "Master" }]} /></span>
          </Tip>
        </div>
        {lockedElsewhere && <p className="hint" style={{ margin: "6px 0 0" }}>The Push's master profile is {lockedElsewhere.name}.</p>}
      </div>

      <div className="railbody">
        <div className="isect">
          <h3>Basics</h3>
          <Field label="Name"><input type="text" value={profile.name} onChange={(e) => updateProfile({ name: e.target.value })} /></Field>
          <IconPicker />
          <div className="field"><span className="lab">Colour</span>
            <div className="swatches">{PALETTE.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-pressed={profile.theme.accent === c} title={colourName(c)} onClick={() => updateProfile({ theme: { ...profile.theme, accent: c } })} />)}
              <CustomColour value={profile.theme.accent} active={!PALETTE.includes(profile.theme.accent)} onChange={(v) => updateProfile({ theme: { ...profile.theme, accent: v } })} /></div>
            <span className="hint">Tints this profile's labels on the Push. The display background always stays black.</span></div>
          <Field label="Scene button" hint="To move it, use Edit layout on the replica and drag the profile to another button.">
            <div onMouseEnter={() => setSceneHl(sceneIdx >= 0 && sceneIdx < 8 ? sceneIdx : null)} onMouseLeave={() => setSceneHl(null)}><span className="mono">{sceneIdx >= 0 ? sceneName(sceneIdx) : "None: more than 16 profiles"}</span></div>
          </Field>
        </div>
        <div className="isect">
          <h3>Turns on automatically in</h3>
          <p className="hint" style={{ marginTop: 0 }}>When one of these apps is in front, the Push switches to this profile.</p>
          {!ids.length && <p className="muted" style={{ marginTop: 0 }}>No apps yet. This profile only shows when you make it master or press its scene button.</p>}
          {ids.map((b) => <AppRow key={b} bundle={b} onRemove={() => updateProfile({ match: { bundle_ids: ids.filter((x) => x !== b) } })} />)}
          {front && !ids.includes(front) && <FrontApp bundle={front} onAdd={() => addApp(front)} />}
          <div className="row"><input className="mono" type="text" placeholder="Or type a bundle ID, e.g. com.company.App" value={bundle} onChange={(e) => setBundle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addApp(bundle)} aria-label="Bundle ID" /><button className="btn" onClick={() => addApp(bundle)} disabled={!bundle.trim()}>Add</button></div>
        </div>
        <div className="isect">
          <h3>On the display</h3>
          <Field label="Home screen subtitle" hint="Shown under the profile name. The Push also shows “Auto” or “Master” in front of it.">
            <input type="text" maxLength={40} value={disp.subtitle ?? ""} placeholder="Automatic" onChange={(e) => updateProfile({ display: { ...disp, subtitle: e.target.value || undefined } })} />
          </Field>
          <Switch checked={disp.knobs !== false} onChange={(v) => updateProfile({ display: { ...disp, knobs: v ? undefined : false } })} label="Show knob readouts" />
        </div>
        <div className="isect">
          <h3>Window shortcuts</h3>
          <Field label="On the top-left pads" hint={`The 16 built-in pads that move and size the window in front. Default follows the global switch in Settings (now ${wp.globalOn ? "on" : "off"}). While on they cover this profile's own pads there; those stay saved.`}>
            <Seg label="Window shortcuts for this profile" value={profile.window_pads ?? "default"} onChange={wp.setProfileMode}
              options={[{ value: "default", label: "Default" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]} />
          </Field>
          {wp.node}
        </div>
        <div className="isect">
          <h3>Everything this profile does <span>{assigned.length}</span></h3>
          {!assigned.length && <p className="muted" style={{ margin: 0 }}>Nothing yet. Click a pad or button on the Push picture, or drag an action onto it.</p>}
          {!!buttons.length && <><span className="lab2 listlab">Buttons</span><div className="alist">{buttons.map(row)}</div></>}
          {!!pads.length && <><span className="lab2 listlab">Pads</span><div className="alist">{pads.map(row)}</div></>}
        </div>
        <div className="isect">
          <h3>About this profile</h3>
          {profile.author?.name
            ? <p className="aboutby"><b>By {profile.author.name}</b>{safeUrl(profile.author.url) && <a href={safeUrl(profile.author.url)} target="_blank" rel="noreferrer">{new URL(safeUrl(profile.author.url)!).hostname.replace(/^www\./, "")}</a>}</p>
            : <p className="muted" style={{ margin: 0 }}>No author yet. You add one when you export it.</p>}
          {profile.description && <p className="aboutdesc">{profile.description}</p>}
          <p className="source"><Icon name={profile.source?.kind === "imported" ? "download" : "file"} size={14} />{sourceLine(profile)}</p>
        </div>
        <div className="isect">
          <h3>Share</h3>
          <div className="row wrap">
            <button className="btn sm" onClick={exportFile}><Icon name="download" size={14} />Export to share</button>
            <button className="btn sm" onClick={() => importer.current?.click()}><Icon name="upload" size={14} />Import a profile</button>
            <input ref={importer} type="file" accept="application/json,.json" hidden onChange={(e) => { if (e.target.files?.[0]) importProfileFile(e.target.files[0]); e.target.value = ""; }} />
            <button className="btn sm" onClick={duplicate}><Icon name="copy" size={14} />Duplicate</button>
          </div>
          <p className="hint" style={{ margin: "8px 0 0" }}>Export saves one file, including the icon. Send it to anyone; they can import it here.</p>
          <div className="row" style={{ marginTop: 14 }}><ConfirmButton className="sm" label="Delete this profile" armedLabel="Confirm delete" icon="trash" onConfirm={() => d.send({ type: "delete_profile", id: profile.id })} /></div>
        </div>
      </div>
      <div className="savestate" aria-live="polite">
        <span className="savetext">{saveState === "saving" ? "Saving…" : saveState === "saved" ? <><Icon name="check" size={14} />Saved {fmtTime(savedAt)}</> : "Changes save automatically"}</span>
        <span className="spacer" />
        <Tip align="right" title="Undo" desc="Takes back your last change to this profile. ⌘Z does the same."><button className="btn ghost sm" onClick={undo} disabled={!canUndo}><Icon name="reset" size={14} />Undo</button></Tip>
        {canRevert && <ConfirmButton className="sm ghost" label="Revert" armedLabel="Confirm revert" icon="reset" onConfirm={revert} />}
      </div>
    </nav>
  );
}

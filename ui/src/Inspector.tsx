import { useEffect, useState } from "react";
import { DisplayIcon, Icon } from "./icons";
import { useApp } from "./ctx";
import type { Action, Ctl } from "./daemon";
import { controlKind, ACTION_KINDS, GLOBAL_FN, MEDIA_ACTIONS, WINDOW_ADDABLE, PALETTE, PAD_COLOURS, actionDefault, colourName, RESERVED_KNOBS, SCENE_IDS, actionKind, profileAt, sceneName, summarize } from "./model";
import { useScenePage } from "./scenePage";
import { Field, Select, Switch, CustomColour, TextArea, TextField, useToast } from "./ui";
import { fmtTime } from "./profileFile";

const isZone = (id: string) => /^btn-(upper|lower)-\d$/.test(id);

// The app name for an "Open app" action: type it, or choose the app in a normal Mac file picker. Says so when macOS can't find it.
export function AppField({ value, onChange, className = "", placeholder }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string }) {
  const [found, setFound] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setFound(null); if (!value.trim()) return;
    const t = setTimeout(() => { fetch(`/api/app-exists?name=${encodeURIComponent(value)}`).then((r) => r.json()).then((j) => setFound(!!j.found)).catch(() => setFound(null)); }, 350);
    return () => clearTimeout(t);
  }, [value]);
  const choose = async () => {
    setBusy(true);
    try { const j = await (await fetch("/api/pick-app")).json(); if (j.name) onChange(j.name); } catch { /* the picker could not open */ }
    setBusy(false);
  };
  return (<div>
    <div style={{ display: "flex", gap: 6 }}>
      <TextField className={className} style={{ flex: 1, minWidth: 0 }} value={value} placeholder={placeholder} aria-label="App name" onChange={onChange} />
      <button type="button" className="btn" disabled={busy} onClick={choose} title="Pick the app from your Mac">{busy ? "Choosing..." : "Choose..."}</button>
    </div>
    {found === false && <div className="muted" style={{ fontSize: 12, marginTop: 5, color: "var(--bad)" }}>macOS can't find an app with this name. Use Choose... to pick it, or check the spelling.</div>}
  </div>);
}

export function ShortcutField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [rec, setRec] = useState(false);
  useEffect(() => {
    if (!rec) return;
    const down = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { setRec(false); return; }
      if (["Meta", "Shift", "Alt", "Control"].includes(e.key)) return;
      const k = e.key === " " ? "space" : e.key.length === 1 ? e.key.toLowerCase() : e.key.replace("Arrow", "").toLowerCase();
      onChange([e.metaKey && "cmd", e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && "shift", k].filter(Boolean).join("+")); setRec(false);
    };
    window.addEventListener("keydown", down, true); return () => window.removeEventListener("keydown", down, true);
  }, [rec]); // eslint-disable-line
  return (
    <div className="rec">
      <input className={`mono ${rec ? "recording" : ""}`} type="text" value={rec ? "Press the keys… (Esc to cancel)" : value} readOnly={rec} placeholder="cmd+shift+r" onChange={(e) => onChange(e.target.value)} aria-label="Shortcut" />
      <button type="button" className={`btn ${rec ? "danger" : ""}`} onClick={() => setRec(!rec)}><Icon name="record" size={15} />{rec ? "Stop" : "Record"}</button>
      <button type="button" className="btn" title="Browsers can't see the Fn key, so add it with this button" onClick={() => onChange("fn")}>Fn</button>
    </div>
  );
}

function ColourFields({ ctl, set, pad, accent }: { ctl: Ctl; set: (c: Ctl) => void; pad: boolean; accent: string }) {
  return (
    <div className="isect">
        <h3>{pad ? "Pad colour" : "Light colour"}</h3>
        <div className="swatches" role="group" aria-label="Colour">
          <button className="swatch none" aria-pressed={!ctl.color} title="Off" aria-label="Off" onClick={() => set({ ...ctl, color: undefined })} />
          <button className="swatch" style={{ background: accent }} aria-pressed={ctl.color === accent} title="Profile colour" aria-label="Profile colour" onClick={() => set({ ...ctl, color: accent })} />
          {PAD_COLOURS.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-pressed={ctl.color?.toLowerCase() === c} title={colourName(c, accent)} aria-label={colourName(c, accent)} onClick={() => set({ ...ctl, color: c })} />)}
          <CustomColour value={ctl.color ?? accent} active={!!ctl.color && ctl.color !== accent && !PAD_COLOURS.includes(ctl.color.toLowerCase())} onChange={(v) => set({ ...ctl, color: v })} />
        </div>
        <Field label="Colour while you hold it" hint="The colour the pad flashes while it is pressed. Default is white.">
          <div className="swatches" role="group" aria-label="Colour while pressed">
            <button className="swatch dflt" aria-pressed={!ctl.states?.active} title="Default (white)" aria-label="Default (white)" onClick={() => set({ ...ctl, states: { ...ctl.states, active: undefined } })}>Default</button>
            {PAD_COLOURS.slice(0, 10).map((c) => <button key={c} className="swatch" style={{ background: c }} aria-pressed={ctl.states?.active?.toLowerCase() === c} title={colourName(c, accent)} aria-label={colourName(c, accent)} onClick={() => set({ ...ctl, states: { ...ctl.states, active: c } })} />)}
            <CustomColour value={ctl.states?.active ?? "#ffffff"} active={!!ctl.states?.active && !PAD_COLOURS.slice(0, 10).includes(ctl.states.active.toLowerCase())} onChange={(v) => set({ ...ctl, states: { ...ctl.states, active: v } })} />
          </div>
        </Field>
    </div>
  );
}

function ActionEditor({ ctl, set }: { ctl: Ctl; set: (c: Ctl) => void }) {
  const a = ctl.action, kind = actionKind(a?.type);
  const pick = (type: string) => { const k = actionKind(type)!; set({ ...ctl, action: { type, [k.field]: actionDefault(k) } as Action }); };
  return (
    <>
      <div className="kinds" role="group" aria-label="Action type">
        {ACTION_KINDS.map((k) => (
          <button key={k.type} className="kind" aria-pressed={a?.type === k.type} onClick={() => pick(k.type)}><Icon name={k.icon} size={17} /><span>{k.label}</span></button>))}
        <button className="kind none" aria-pressed={!a} onClick={() => set({ ...ctl, action: undefined })}><Icon name="x" size={17} /><span>No action</span></button>
      </div>
      {a && kind && (
        <Field label={kind.fieldLabel} hint={kind.hint}>
          {a.type === "keys" ? <ShortcutField value={String(a.keys ?? "")} onChange={(v) => set({ ...ctl, action: { ...a, keys: v } })} />
            : a.type === "media" ? (
              <Select value={String(a.name ?? "")} onChange={(v) => set({ ...ctl, action: { ...a, name: v } })} options={MEDIA_ACTIONS as unknown as [string, string][]} />)
            : a.type === "window" ? (
              <Select value={String(a.op ?? "")} onChange={(v) => set({ ...ctl, action: { ...a, op: v } })} options={WINDOW_ADDABLE as unknown as [string, string][]} />)
            : a.type === "text" || a.type === "shell" ? <TextArea className="mono" rows={3} value={String(a[kind.field] ?? "")} placeholder={kind.placeholder} onChange={(v) => set({ ...ctl, action: { ...a, [kind.field]: v } })} />
            : a.type === "app" ? <AppField value={String(a.name ?? "")} placeholder={kind.placeholder} onChange={(v) => set({ ...ctl, action: { ...a, name: v } })} />
            : <TextField className={a.type === "url" ? "mono" : ""} value={String(a[kind.field] ?? "")} placeholder={kind.placeholder} onChange={(v) => set({ ...ctl, action: { ...a, [kind.field]: v } })} />}
        </Field>)}
      {a?.type === "keys" && String(a.keys ?? "").trim().toLowerCase() === "fn" && <Switch checked={!!a.hold} onChange={(v) => set({ ...ctl, action: { ...a, hold: v } })}
        label={<span>Hold while pressed<span className="muted" style={{ display: "block", fontWeight: 500, fontSize: 12, marginTop: 3 }}>Holds Fn down for as long as the pad is down, and lets go when you release it. Dictation tools like Wispr Flow listen for that.</span></span>} />}
      {a && <Switch checked={!!ctl.risky} onChange={(v) => set({ ...ctl, risky: v })} label={<span>Confirm before running<span className="muted" style={{ display: "block", fontWeight: 500, fontSize: 12, marginTop: 3 }}>Press twice to run it: the first press arms the pad, a second press within 2 seconds runs it. Good for anything you can’t undo.</span></span>} />}
    </>
  );
}

export default function Inspector() {
  const [scenePage] = useScenePage();   // (a hook: before any early return)
  const { d, profile, rawControls, selected, setSelected, updateControl, saveState, savedAt, openSettings, setCurrent } = useApp();
  const [iconsOpen, setIconsOpen] = useState(false);
  const id = selected; const toast = useToast();
  if (!id || !profile) return (
    <aside className="inspector" aria-label="Control settings"><div className="head"><div className="coltitle"><b>Selected control</b><span>The one you picked</span></div></div><div className="emptystate">
      <span className="emptyicon"><Icon name="pad" size={22} /></span>
      <h2>Nothing selected yet</h2>
      <ol className="steps">
        <li><b>Pick a control.</b> Click a pad, button or knob on the Push picture, or press it on your real Push.</li>
        <li><b>Say what it does.</b> Give it a label, a colour and an action.</li>
        <li><b>Try it.</b> Press Try it now, or press it on the Push.</li>
      </ol>
      <p className="muted"><span className="kbd">⌘K</span> finds any control by name.</p></div></aside>);
  const name = d.controls[id]?.name ?? id;
  const gk = d.settings?.global_knobs?.[id];
  const si = SCENE_IDS.indexOf(id) >= 0 ? SCENE_IDS.indexOf(id) + scenePage * 8 : -1;
  const head = (title: string, chips: React.ReactNode) => (
    <div className="head"><h2>{title}</h2><div className="id">{chips}<button className="btn ghost sm icon" style={{ marginLeft: "auto" }} aria-label="Deselect" title="Deselect this control" onClick={() => setSelected(null)}><Icon name="x" size={14} /></button></div></div>);

  if (gk) {
    const f = GLOBAL_FN[gk]; const v = gk === "volume" ? d.volume : gk === "leds" ? d.settings!.brightness : d.settings!.display_brightness;
    const key = gk === "leds" ? "brightness" : "display_brightness";
    return (<aside className="inspector">{head(f.title, <span className="chipbadge accent">works in every profile</span>)}
      <div className="isect"><h3>{name}</h3>
        {gk === "volume" ? <p className="muted" style={{ marginTop: 0 }}>The Mac's output volume. Turn the knob, or scroll over it in the replica.</p>
          : <input type="range" min={5} max={100} value={v} aria-label={f.title} onChange={(e) => { const x = +e.target.value; d.send({ type: "set_setting", key, value: x }); if (gk === "brightness") d.send({ type: "set_setting", key: "brightness", value: Math.max(5, Math.min(100, d.settings!.brightness + x - v)) }); }} />}
        <div className="mono tabular" style={{ marginTop: 6 }}>{Math.round(v)}%</div></div>
      <div className="isect"><button className="btn block" onClick={() => openSettings("knobs")}><Icon name="knob" size={16} />Change which knob does what</button></div></aside>);
  }
  if (RESERVED_KNOBS.includes(id)) return (<aside className="inspector">{head("Not used", <span className="chipbadge">reserved</span>)}<div className="tips">{name} has no function. Use Edit layout to drag one onto it, or pick one in Settings → Knobs.</div></aside>);
  if (id === "btn-master") return (<aside className="inspector">{head("Master profile", <span className="chipbadge accent">works in every profile</span>)}<div className="tips">Press <b>Master</b>, then one of the 8 profile buttons, to make that profile the master: it stays on the Push whichever app is in front. Press Master again, or the master profile's button, to go back to Auto.
    <div style={{ marginTop: 12 }}><button className="btn" onClick={() => d.send({ type: "press", control: "btn-master" })}><Icon name="pin" size={15} />{d.active.armed ? "Cancel" : d.active.pinned ? "Back to Auto" : "Choose a master profile"}</button></div></div></aside>);
  if (id === "btn-repeat") return (<aside className="inspector">{head("Rerun the last test", <span className="chipbadge accent">works in every profile</span>)}<div className="tips">Press Repeat on the Push to run the last test again. It stays lit so you can always find it.</div></aside>);
  if (id === "btn-setup") return (<aside className="inspector">{head("Colour calibration", <span className="chipbadge accent">works in every profile</span>)}<div className="tips">Hold <b>Shift</b> and press <b>Setup</b> to start the colour calibration test.<div style={{ marginTop: 12 }}><button className="btn" onClick={() => openSettings("color")}>Open calibration</button></div></div></aside>);
  if (si >= 0) {
    const p = profileAt(d.profiles, si), locked = !!p && d.active.pinned === p.id;
    return (<aside className="inspector">{head(p ? `Switches to ${p.name}` : "Profile button, empty", <span className="chipbadge">{sceneName(si)}</span>)}
      <div className="isect">{p ? <><p className="hint" style={{ marginTop: 0 }}>Pressing this button on the Push switches it to {p.name}.</p>
        <div className="row wrap"><button className="btn" onClick={() => setCurrent(p.id)}><Icon name="eye" size={16} />Edit this profile</button>
        <button className="btn" onClick={() => d.send({ type: "set_profile", id: locked ? null : p.id })}><Icon name="pin" size={16} />{locked ? "Back to Auto" : "Make master"}</button></div></>
        : <p className="muted" style={{ margin: 0 }}>No profile is on this button. New profiles take the next free one, and Edit layout lets you drag a profile onto it.</p>}</div></aside>);
  }
  if (d.controls[id]?.kind === "knob" || d.controls[id]?.kind === "strip") {
    return (<aside className="inspector">{head(name, <span className="chipbadge warn">not assignable yet</span>)}<div className="tips">Per-profile functions for encoders and the touch strip are planned. Today the encoders marked on the replica are global.</div></aside>);
  }

  if (controlKind(id, d.settings, d.controls[id]?.kind, profile) === "window") {   // a built-in window pad: it stays where it is and does what it does; its name, colours and confirm can change
    const w: Ctl = profile.controls[id] ?? {}, own = rawControls?.[id], covers = !!own && !!(own.label || own.action || own.color), edited = !!d.settings?.window_pad_edits?.[id];
    const setW = (c: Ctl) => updateControl(id, c);
    return (<aside className="inspector" aria-label="Inspector">{head(w.label || "Window shortcut", <span className="capmono" title={id}>{name} · window shortcut</span>)}
      <div className="isect"><p className="hint" style={{ marginTop: 0 }}>Built in: it {summarize(w.action).replace("Window: ", "does ").toLowerCase()} on the window in front. It can't be removed or moved, and the whole set is switched on or off in Settings. Name and colours are the same in every profile.</p>
        {covers && <p className="hint">This pad covers “{own!.label || "a pad"}” in this profile. It stays saved and comes back when window shortcuts are off for this profile.</p>}
        <div className="row wrap"><button className="btn" onClick={() => openSettings("general")}><Icon name="grid" size={16} />Window shortcut settings</button></div></div>
      <div className="isect"><h3>Name</h3>
        <div className="field"><TextField value={w.label ?? ""} maxLength={24} aria-label="Name" onChange={(v) => setW({ ...w, label: v })} placeholder="Name" /><span className="hint">Shown on this pad in the app.</span></div></div>
      <ColourFields ctl={w} set={setW} pad accent={profile.theme.accent} />
      <div className="isect"><Switch checked={!!w.risky} onChange={(v) => setW({ ...w, risky: v })} label={<span>Confirm before running<span className="muted" style={{ display: "block", fontWeight: 500, fontSize: 12, marginTop: 3 }}>Press twice to run it: the first press arms the pad, a second press within 2 seconds runs it.</span></span>} /></div>
      <div className="ifoot">
        <div className="row">
          <button className="btn primary" onClick={() => { if (w.risky) toast("Armed. Press Try it now again within 2 seconds to run it.", "info"); d.send({ type: "press", control: id }); }}><Icon name="play" size={15} />Try it now</button>
          <span className="spacer" />
          <button className="btn ghost" onClick={() => updateControl(id, null)} disabled={!edited}><Icon name="reset" size={15} />Reset pad</button>
        </div>
        <div className="savestate" aria-live="polite">Changes save automatically</div>
      </div></aside>);
  }
  const ctl: Ctl = profile.controls[id] ?? {};
  const set = (c: Ctl) => updateControl(id, c);
  const zone = isZone(id), pad = id.startsWith("pad-");
  const dispIcons = Object.entries(d.icons);
  const act = summarize(ctl.action);
  return (
    <aside className="inspector" aria-label="Inspector">
      {head(ctl.label || act || "Unassigned", <span className="capmono" title={id}>{name}{zone ? " · display button" : ""}</span>)}
      <div className="isect"><h3>What it does</h3><ActionEditor ctl={ctl} set={set} /></div>
      <div className="isect">
        <h3>{zone ? "On the Push's screen" : "Name"}</h3>
        <div className="field"><TextField value={ctl.label ?? ""} maxLength={24} aria-label={zone ? "Display label" : "Name"} onChange={(v) => set({ ...ctl, label: v })} placeholder={zone ? "e.g. Frame" : "e.g. Close tab"} />
          <span className="hint">{zone ? "Shown above or below this button on the Push's screen." : "Shown on this pad in the app."}</span></div>
        {zone && <>
          <div className="row between" style={{ marginBottom: 10 }}>
            <button className="btn sm" onClick={() => setIconsOpen(!iconsOpen)} aria-expanded={iconsOpen}>
              {ctl.icon && d.icons[ctl.icon] ? <DisplayIcon shapes={d.icons[ctl.icon]} size={16} /> : <Icon name="plus" size={14} />}{ctl.icon ? "Change icon" : "Add icon"}</button>
            {ctl.icon && <button className="btn ghost sm" onClick={() => set({ ...ctl, icon: undefined })}>Remove</button>}
          </div>
          {iconsOpen && <div className="iconpick" role="group" aria-label="Icon">{dispIcons.map(([n, shapes]) => <button key={n} aria-pressed={ctl.icon === n} title={n} onClick={() => { set({ ...ctl, icon: n }); }}><DisplayIcon shapes={shapes} /></button>)}</div>}
          <div style={{ marginTop: 12 }}><Switch checked={!ctl.keep_case} onChange={(v) => set({ ...ctl, keep_case: !v })} label="ALL CAPS" /></div>
        </>}
      </div>
      <ColourFields ctl={ctl} set={set} pad={pad} accent={profile.theme.accent} />
      <div className="ifoot">
        <div className="row">
          <button className="btn primary" onClick={() => { if (ctl.risky) toast("Armed. Press Try it now again within 2 seconds to run it.", "info"); d.send({ type: "press", control: id }); }} disabled={!ctl.action}><Icon name="play" size={15} />Try it now</button>
          <span className="spacer" />
          <button className="btn ghost danger" onClick={() => updateControl(id, null)} disabled={!profile.controls[id]}><Icon name="trash" size={15} />{zone ? "Clear button" : "Clear pad"}</button>
        </div>
        <div className="savestate" aria-live="polite">{saveState === "saving" ? <>Saving…</> : saveState === "saved" ? <><Icon name="check" size={14} />Saved {fmtTime(savedAt)}</> : <>Changes save automatically</>}</div>
      </div>
    </aside>
  );
}

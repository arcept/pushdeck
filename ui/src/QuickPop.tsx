import { useEffect, useRef } from "react";
import { Icon } from "./icons";
import { useApp } from "./ctx";
import { AppField, ShortcutField } from "./Inspector";
import { CustomColour, Select, TextField } from "./ui";
import { ACTION_KINDS, GLOBAL_FN, MEDIA_ACTIONS, PALETTE, actionDefault, colourName, actionKind, controlKind, describeControl } from "./model";
import type { Action } from "./daemon";
import { usePop } from "./motion";

// A small editor that opens beside a control when you click it on the replica. The right-hand inspector has the full set.
export default function QuickPop({ id, rect, onClose }: { id: string; rect: DOMRect; onClose: () => void }) {
  const { d, profile, updateControl, setSelected } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  usePop(ref);
  useEffect(() => {
    const down = (e: MouseEvent) => { const t = e.target as Element; if (!ref.current?.contains(t) && !t.closest?.(".replica g.control")) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose]);
  const W = 296, name = d.controls[id]?.name ?? id;
  const left = rect.right + 14 + W < window.innerWidth ? rect.right + 14 : Math.max(8, rect.left - 14 - W);
  const top = Math.max(64, Math.min(rect.top - 24, window.innerHeight - 380));
  const kind = controlKind(id, d.settings, d.controls[id]?.kind, profile);
  const ctl = profile?.controls[id] ?? {};
  const set = (c: typeof ctl) => updateControl(id, c);
  const tip = describeControl(id, { name, settings: d.settings, profiles: d.profiles, pinned: d.active.pinned, profile });
  const a = ctl.action, k = actionKind(a?.type);
  const zone = /^btn-(upper|lower)-\d$/.test(id);

  let body: React.ReactNode;
  if (kind === "global") {
    const which = d.settings!.global_knobs![id]; const f = GLOBAL_FN[which];
    const v = which === "volume" ? d.volume : which === "leds" ? d.settings!.brightness : d.settings!.display_brightness;
    const key = which === "leds" ? "brightness" : "display_brightness";
    body = (<>
      {which === "volume" ? <p className="muted" style={{ margin: "4px 0 10px" }}>The Mac's output volume. Turn the knob, or scroll over it.</p>
        : <input type="range" min={5} max={100} step={1} value={v} aria-label={f.title} onChange={(e) => { const x = +e.target.value; d.send({ type: "set_setting", key, value: x }); if (which === "brightness") d.send({ type: "set_setting", key: "brightness", value: Math.max(5, Math.min(100, d.settings!.brightness + x - v)) }); }} />}
      <div className="mono tabular">{Math.round(v)}%</div></>);
  } else if (kind === "editable" && profile) {
    body = (<>
      <TextField className="qp-in" value={ctl.label ?? ""} maxLength={24} aria-label={zone ? "Display label" : "Name"} placeholder={zone ? "Label on the display" : "Name"} onChange={(v) => set({ ...ctl, label: v })} />
      <Select className="qp-in" value={a?.type ?? ""} ariaLabel="Action type" onChange={(v) => { const kk = actionKind(v); set({ ...ctl, action: kk ? ({ type: kk.type, [kk.field]: actionDefault(kk) } as Action) : undefined }); }} options={[["", "No action"], ...ACTION_KINDS.map((x) => [x.type, x.label] as [string, string])]} />
      {a && k && (a.type === "keys" ? <ShortcutField value={String(a.keys ?? "")} onChange={(v) => set({ ...ctl, action: { ...a, keys: v } })} />
        : a.type === "media" ? <Select className="qp-in" value={String(a.name ?? "")} onChange={(v) => set({ ...ctl, action: { ...a, name: v } })} options={MEDIA_ACTIONS as unknown as [string, string][]} />
        : a.type === "app" ? <AppField className="qp-in" value={String(a.name ?? "")} placeholder={k.placeholder} onChange={(v) => set({ ...ctl, action: { ...a, name: v } })} />
        : <TextField className={`qp-in ${a.type === "url" || a.type === "shell" ? "mono" : ""}`} value={String(a[k.field] ?? "")} placeholder={k.placeholder} aria-label={k.fieldLabel} onChange={(v) => set({ ...ctl, action: { ...a, [k.field]: v } })} />)}
      <div className="swatches" role="group" aria-label="Colour">
        <button className="swatch none" aria-pressed={!ctl.color} title="Off" onClick={() => set({ ...ctl, color: undefined })} />
        {[profile.theme.accent, ...PALETTE.filter((c) => c !== profile.theme.accent)].slice(0, 7).map((c) => <button key={c} className="swatch" style={{ background: c }} aria-pressed={ctl.color === c} title={colourName(c, profile.theme.accent)} onClick={() => set({ ...ctl, color: c })} />)}
        <CustomColour value={ctl.color ?? profile.theme.accent} active={!!ctl.color && ctl.color !== profile.theme.accent && !PALETTE.includes(ctl.color)} onChange={(v) => set({ ...ctl, color: v })} />
      </div>
      <div className="row between" style={{ marginTop: 10 }}>
        <button className="btn sm" disabled={!ctl.action} onClick={() => d.send({ type: "press", control: id })}><Icon name="play" size={13} />Try it</button>
        <button className="btn sm ghost danger" disabled={!profile.controls[id]} onClick={() => { updateControl(id, null); }}><Icon name="trash" size={13} />Clear</button>
      </div></>);
  } else body = <p className="muted" style={{ margin: 0 }}>{tip.secondary.join(" · ")}</p>;

  return (
    <div className="quickpop" ref={ref} style={{ left, top, width: W }} role="dialog" aria-label={`Quick edit: ${name}`}>
      <div className="qp-head"><div><div className="qp-title">{tip.primary}</div><div className="qp-sub">{name}{kind === "global" ? " · works in every profile" : ""}</div></div>
        <button className="btn ghost sm icon" onClick={() => { setSelected(null); onClose(); }} aria-label="Close" title="Close"><Icon name="x" size={14} /></button></div>
      {body}
    </div>
  );
}

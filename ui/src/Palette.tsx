import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";
import { useApp } from "./ctx";
import { describeControl } from "./model";

type Cmd = { id: string; group: string; title: string; hint?: string; icon: IconName; run: () => void };

export default function Palette({ dialog }: { dialog: ReturnType<typeof import("./ui").useDialog> }) {
  const { d, profile, setCurrent, setSelected, openSettings, setListen, listen } = useApp();
  const [q, setQ] = useState(""), [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const done = (f: () => void) => () => { dialog.close(); f(); };

  const cmds = useMemo<Cmd[]>(() => {
    const c: Cmd[] = [];
    d.profiles.forEach((p) => {
      c.push({ id: "p-" + p.id, group: "Profiles", title: `Edit ${p.name}`, icon: "stack", run: done(() => setCurrent(p.id)) });
      c.push({ id: "pin-" + p.id, group: "Profiles", title: `Make ${p.name} the master profile`, icon: "pin", run: done(() => d.send({ type: "set_profile", id: p.id })) });
    });
    c.push({ id: "intro", group: "Help", title: "How this page works", icon: "eye", run: done(() => window.dispatchEvent(new Event("push-intro"))) });
    if (d.active.pinned) c.push({ id: "unpin", group: "Profiles", title: "Back to Auto: let the frontmost app choose", icon: "pin", run: done(() => d.send({ type: "set_profile", id: null })) });
    Object.entries(d.tests).forEach(([k, t]) => c.push({ id: "t-" + k, group: "Tests", title: `Run test: ${t.title}${t.group === "Colour" ? " (colour)" : ""}`, icon: "flask", run: done(() => d.send({ type: "run_test", name: k })) }));
    ([["general", "General"], ["display", "Display and lights"], ["knobs", "Knobs"], ["color", "Colour calibration"], ["tests", "Tests"], ["device", "Device"], ["profiles", "Profiles"], ["media", "Media and visualizer"], ["about", "About"]] as const).forEach(([k, l]) =>
      c.push({ id: "s-" + k, group: "Settings", title: `Settings: ${l}`, icon: "gear", run: done(() => openSettings(k)) }));
    c.push({ id: "live", group: "Actions", title: listen ? "Turn Sync with Push off" : "Turn Sync with Push on", icon: "live", run: done(() => setListen(!listen)) });
    c.push({ id: "off", group: "Actions", title: d.standby ? "Turn Push on" : "Turn Push off", icon: "power", run: done(() => d.send({ type: "standby", on: !d.standby })) });
    Object.entries(d.controls).forEach(([id, ctl]) => {
      const tip = describeControl(id, { name: ctl.name, settings: d.settings, profiles: d.profiles, pinned: d.active.pinned, profile });
      c.push({ id: "c-" + id, group: "Controls", title: `Select ${ctl.name}`, hint: tip.muted ? id : `${tip.primary} · ${id}`, icon: "pad", run: done(() => setSelected(id)) });
    });
    return c;
  }, [d.profiles, d.tests, d.controls, d.settings, d.active.pinned, d.standby, listen, profile]); // eslint-disable-line

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? cmds.filter((c) => (c.title + " " + (c.hint ?? "")).toLowerCase().includes(t)) : cmds.filter((c) => c.group !== "Controls");
    return list.slice(0, 40);
  }, [cmds, q]);
  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { if (dialog.open) { setQ(""); setTimeout(() => input.current?.focus(), 0); } }, [dialog.open]);
  useEffect(() => { const el = dialog.ref.current; if (!el) return; const h = (e: MouseEvent) => { if (e.target === el) dialog.close(); }; el.addEventListener("mousedown", h); return () => el.removeEventListener("mousedown", h); }, [dialog]);

  let last = "";
  return (
    <dialog ref={dialog.ref} className="palette" aria-label="Command palette">
      <input ref={input} type="text" role="combobox" aria-expanded="true" aria-controls="cmdlist" value={q} placeholder="Find a profile, control, test or setting" onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(shown.length - 1, x + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); } else if (e.key === "Enter") shown[i]?.run(); }} />
      <div className="results" id="cmdlist" role="listbox">
        {shown.map((c, n) => { const head = c.group !== last ? <div className="grp" key={"g" + c.group}>{c.group}</div> : null; last = c.group; return (
          <div key={c.id}>{head}<button className="popitem" role="option" aria-selected={n === i} onMouseEnter={() => setI(n)} onClick={c.run}><Icon name={c.icon} size={16} />{c.title}{c.hint && <code className="muted" style={{ marginLeft: "auto" }}>{c.hint}</code>}</button></div>); })}
        {!shown.length && <div className="empty">Nothing matches “{q}”.</div>}
      </div>
    </dialog>
  );
}

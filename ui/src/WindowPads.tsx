import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile } from "./daemon";
import { useApp } from "./ctx";
import { windowConflicts } from "./model";

type Warn = { title: string; lines: { who: string; pads: string[] }[]; confirm: string; apply: () => void } | null;

// The built-in window pads cover whatever a profile has on the top-left 4 x 4 pads while they are on. Turning them on lists what will be covered first.
export function useWindowPads() {
  const { d, profile, rawControls, updateProfile } = useApp();
  const [warn, setWarn] = useState<Warn>(null);
  const globalOn = d.settings?.window_pads !== false;

  const setGlobal = useCallback((on: boolean) => {
    const apply = () => d.send({ type: "set_setting", key: "window_pads", value: on });
    if (!on) { apply(); return; }
    // every profile that follows the global switch (or has no choice of its own) would now be covered
    const lines = d.profiles.filter((p) => p.window_pads !== "off" && p.window_pads !== "on").map((p) => ({ who: p.name, pads: windowConflicts(p.controls) })).filter((l) => l.pads.length);
    if (lines.length) setWarn({ title: "Window shortcuts will cover some of your pads", lines, confirm: "Turn on", apply }); else apply();
  }, [d]);

  const setProfileMode = useCallback((mode: "default" | "on" | "off") => {
    if (!profile) return;
    const apply = () => updateProfile({ window_pads: mode === "default" ? undefined : mode });
    const on = mode === "on" || (mode === "default" && globalOn), wasOn = profile.window_pads === "on" || (profile.window_pads === undefined && globalOn);
    const pads = windowConflicts(rawControls);
    if (on && !wasOn && pads.length) setWarn({ title: `Window shortcuts will cover some pads of ${profile.name}`, lines: [{ who: profile.name, pads }], confirm: "Turn on", apply }); else apply();
  }, [profile, rawControls, updateProfile, globalOn]);

  const node = <WindowPadsWarn state={warn} onClose={() => setWarn(null)} />;
  return { node, setGlobal, setProfileMode, globalOn };
}

function WindowPadsWarn({ state, onClose }: { state: Warn; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; if (state && !el.open) el.showModal(); else if (!state && el.open) el.close(); }, [state]);
  return (
    <dialog ref={ref} className="winwarn" aria-label="Window shortcuts will cover some pads" onClose={onClose}>
      {state && <>
        <h3>{state.title}</h3>
        <p className="hint">The window pads sit on the 16 pads at the top left of the Push. These pads are in the way:</p>
        <ul>{state.lines.map((l) => <li key={l.who}><b>{l.who}</b>: {l.pads.join(", ")}</li>)}</ul>
        <p className="hint">They stay saved in the profile and come back when window shortcuts are turned off.</p>
        <div className="row wrap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { state.apply(); onClose(); }}>{state.confirm}</button>
        </div></>}
    </dialog>);
}
export type { Profile };

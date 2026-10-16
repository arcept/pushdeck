import { useEffect } from "react";
import { Orb } from "./Orb";
import { Icon, type IconName } from "./icons";
import { useApp, type SettingsPage } from "./ctx";
import CalibrationPanel from "./Calibration";
import { GLOBAL_FN, KNOB_ROWS } from "./model";
import { ConfirmButton, Field, Seg, Switch } from "./ui";
import { AboutPage, ProfilesPage } from "./SettingsExtra";
import MediaPage from "./MediaPage";
import { useWindowPads } from "./WindowPads";

const PAGES: { id: SettingsPage; label: string; icon: IconName }[] = [
  { id: "general", label: "General", icon: "sliders" }, { id: "display", label: "Display and lights", icon: "sun" },
  { id: "profiles", label: "Profiles", icon: "stack" }, { id: "media", label: "Media", icon: "music" }, { id: "knobs", label: "Knobs", icon: "knob" }, { id: "color", label: "Colour calibration", icon: "drop" },
  { id: "tests", label: "Tests", icon: "flask" }, { id: "device", label: "Device", icon: "power" }, { id: "about", label: "About", icon: "info" },
];
const LIFECYCLE = [["login", "Start at login, always on"], ["login_sleep", "Start at login, sleep with the Mac or when idle"], ["manual", "Completely manual"], ["ui_only", "Only while the UI app is open"]];

export default function SettingsSheet({ dialog, page, setPage }: { dialog: ReturnType<typeof import("./ui").useDialog>; page: SettingsPage; setPage: (p: SettingsPage) => void }) {
  const { d } = useApp();
  const s = d.settings;
  const set = (key: string, value: unknown) => d.send({ type: "set_setting", key, value });
  const wp = useWindowPads();
  useEffect(() => { const el = dialog.ref.current; if (!el) return; const h = (e: MouseEvent) => { if (e.target === el) dialog.close(); }; el.addEventListener("mousedown", h); return () => el.removeEventListener("mousedown", h); }, [dialog]);
  const groups = Object.entries(Object.entries(d.tests).reduce<Record<string, [string, typeof d.tests[string]][]>>((a, [k, v]) => ((a[v.group] ??= []).push([k, v]), a), {}));
  const knobFn = (k: string) => s?.global_knobs?.[k] ?? "";
  const setKnob = (k: string, v: string) => { const g = { ...(s?.global_knobs ?? {}) }; for (const [kk, vv] of Object.entries(g)) if (vv === v && v) delete g[kk]; if (v) g[k] = v; else delete g[k]; set("global_knobs", g); };

  return (
    <dialog ref={dialog.ref} className="sheet" aria-label="Settings">
      <div className="sheetgrid">
        <nav className="sheetnav" aria-label="Settings sections">
          <h2>Settings</h2>
          {PAGES.map((p) => <button key={p.id} className="navitem" aria-current={page === p.id ? "page" : undefined} onClick={() => setPage(p.id)}><Icon name={p.icon} size={16} />{p.label}</button>)}
        </nav>
        <div className="sheetbody">
          <button className="btn icon ghost sheetclose" onClick={dialog.close} aria-label="Close settings" title="Close settings"><Icon name="x" size={18} /></button>
          {!s ? <div className="skel" style={{ height: 120 }} /> : <>
          {page === "general" && <><h2>General</h2><p className="lead">How the Push behaves day to day.</p>
            <Field label="When the Push runs" hint="Start-at-login needs the launch agent, which is not installed yet."><select value={s.lifecycle} onChange={(e) => set("lifecycle", e.target.value)}>{LIFECYCLE.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            <Field label="Turn the display and lights off after" hint="Any button wakes it. 0 means never."><div className="row"><input type="number" min={0} max={240} value={s.idle_minutes} style={{ width: 90 }} onChange={(e) => set("idle_minutes", +e.target.value)} /><span className="muted">minutes without input</span></div></Field>
            <Field label="Claude usage on the display" hint="Uses the Claude desktop app's own login (macOS asks to open its Keychain entry, Claude Safe Storage) and asks Anthropic's usage page, the same one the app uses, about every 90 seconds. Works for chat, co-work and Code with no terminal. Off: numbers come only from Claude Code's status line in a terminal. The login stays in memory and goes only to api.anthropic.com."><Switch checked={!!s.claude_usage_live} onChange={(v) => set("claude_usage_live", v)} label={<span className="sr">Read Claude usage live</span>} /></Field>
            <Field label="Window shortcuts" hint="The 16 pads at the top left of the Push move and size the window in front: halves, quarters, thirds, maximize, center, full screen and the next or previous display. They are built in and cannot be edited. This is the default for every profile; each profile can switch them on or off for itself. While on they cover that profile's own pads in those places (kept, and back when off). Needs Accessibility for Push Deck."><Switch checked={wp.globalOn} onChange={wp.setGlobal} label={<span className="sr">Window shortcuts</span>} /></Field>
            <Field label="Welcome setup" hint="The first-run walk-through: your Push 2, permissions, Claude usage and a quick tour."><button className="btn" onClick={() => { dialog.close(); window.dispatchEvent(new Event("push-onboarding")); }}>Run the welcome setup again</button></Field></>}
          {page === "display" && <><h2>Display and lights</h2><p className="lead">The Swing encoder on the Push moves both together.</p>
            <Field label={`Display brightness · ${Math.round(s.display_brightness)}%`}><input type="range" min={5} max={100} value={s.display_brightness} onChange={(e) => set("display_brightness", +e.target.value)} /></Field>
            <Field label={`Pad and button brightness · ${Math.round(s.brightness)}%`}><input type="range" min={5} max={100} value={s.brightness} onChange={(e) => set("brightness", +e.target.value)} /></Field>
            <p className="muted">The display background is always pure black. Colours can be tuned under Colour calibration.</p></>}
          {page === "knobs" && <><h2>Knobs</h2><p className="lead">Each function can sit on any of the eleven encoders and works in every profile.</p>
            <div className="knobtable">
              {KNOB_ROWS.map(([id, nm]) => <><span key={"l" + id} className="tx2" style={{ fontWeight: 700 }}>{nm}</span>
                <select key={"s" + id} value={knobFn(id)} onChange={(e) => setKnob(id, e.target.value)} aria-label={nm}><option value="">Not assigned</option>{Object.entries(GLOBAL_FN).map(([k, f]) => <option key={k} value={k}>{f.title}</option>)}</select></>)}
            </div>
            <p className="muted" style={{ marginTop: 18 }}>Tempo, Swing and Master are unused until you give them a function. You can also drag functions between encoders with Edit layout on the replica.</p>
            <section className="setgroup" style={{ marginTop: 18 }}><h3>Sensitivity</h3>
              <Field label="Full turns from 0 to 100"><select value={String(s.knob_turns_full_range ?? 2.5)} onChange={(e) => set("knob_turns_full_range", +e.target.value)}>{[1.5, 2, 2.5, 3, 4].map((t) => <option key={t} value={t}>{t} turns</option>)}</select></Field>
              <div className="trow"><div><div className="t">{s.knob_ticks_per_turn ?? 128} ticks per turn {s.knob_measured ? "" : "(estimate)"}</div><div className="d">Each tick moves a value by {(100 / ((s.knob_turns_full_range ?? 2.5) * (s.knob_ticks_per_turn ?? 128))).toFixed(2)}%. Measure your encoder for an exact figure.</div></div>
                <button className="btn" disabled={d.test.state === "running"} onClick={() => d.send({ type: "run_test", name: "knob_sensitivity" })}>{d.test.state === "running" && d.test.name === "knob_sensitivity" ? <Orb state="searching" size={18} /> : <Icon name="knob" size={15} />}{d.test.state === "running" && d.test.name === "knob_sensitivity" ? "Measuring…" : "Measure"}</button></div></section></>}
          {page === "color" && <><h2>Colour calibration</h2><p className="lead">Tune how colours look on the Push's display.</p>{s.calibration && <CalibrationPanel cal={s.calibration} test={d.test} send={d.send} />}</>}
          {page === "profiles" && <ProfilesPage close={dialog.close} />}
          {page === "media" && <MediaPage />}
          {page === "about" && <AboutPage close={dialog.close} />}
          {page === "tests" && <><h2>Tests</h2><p className="lead">Run any test here, or rerun the last one with the Repeat button on the Push.</p>
            {groups.map(([g, list]) => <section key={g} className="setgroup"><h3>{g}</h3>{list.filter(([k]) => k !== "cal_red" && k !== "cal_green" && k !== "cal_blue" && k !== "cal_saturation").map(([k, t]) => (
              <div key={k} className="trow"><div><div className="t">{t.title}</div><div className="d">{t.description}{t.interactive ? " Needs you at the Push." : ""}</div></div>
                {d.test.state === "running" && d.test.name === k
                  ? <button className="btn" onClick={() => d.send({ type: "stop_test" })} title="End this test now. It also ends by itself after a minute without input, or when you press Repeat on the Push."><Orb state="working" size={18} />Stop</button>
                  : <button className="btn" disabled={d.test.state === "running"} onClick={() => d.send({ type: "run_test", name: k })}><Icon name="play" size={14} />Run</button>}</div>))}</section>)}
            {d.test.state === "done" && <p className="muted" style={{ marginTop: 6 }}>Last result — {d.test.stopped ? "stopped" : d.test.ok ? "pass" : "fail"}{d.test.stopped ? "" : `: ${d.test.summary}`}</p>}</>}
          {page === "device" && <><h2>Device</h2><p className="lead">Connection, power and diagnostics.</p>
            <section className="setgroup"><h3>Status</h3>
              <div className="trow"><div className="t">USB display</div><span className={`chipbadge ${d.status.usb ? "good" : "bad"}`}>{d.status.usb ? "Connected" : "Not found"}</span></div>
              <div className="trow"><div className="t">MIDI ports</div><span className={`chipbadge ${d.status.midi ? "good" : "bad"}`}>{d.status.midi ? "Connected" : "Missing"}</span></div>
              <div className="trow"><div><div className="t">Power adapter</div><div className="d">The Push gives no signal for this. A dim display usually means it runs on USB power alone.</div></div><span className="chipbadge">Not detectable</span></div></section>
            <section className="setgroup"><h3>Turn the Push off</h3>
              <p className="muted" style={{ marginTop: 0 }}>Blanks the display, turns every light off and ignores the Push until you turn it on. Use it if the device misbehaves. The Push itself can't be powered off by software.</p>
              {d.standby ? <button className="btn primary" onClick={() => d.send({ type: "standby", on: false })}><Icon name="power" size={15} />Turn Push on</button>
                : <ConfirmButton label="Turn Push off" armedLabel="Confirm turn off" icon="power" onConfirm={() => d.send({ type: "standby", on: true })} />}</section>
            <section className="setgroup"><h3>Reset</h3><p className="muted" style={{ marginTop: 0 }}>Puts knob functions, brightness, idle timing and the rest of these settings back to how they came. Your profiles and colour calibration are kept.</p>
              <ConfirmButton label="Reset Push settings" armedLabel="Confirm reset" icon="reset" onConfirm={() => d.send({ type: "reset_settings" })} /></section>
            <section className="setgroup"><h3>Diagnostics</h3><p className="muted" style={{ marginTop: 0 }}>Knob events are logged to <code>/tmp/push_knob_events.log</code> (marked ok or IGNORED). Turns without a touch are ignored as noise.</p>
              <Seg label="Noise guard" value={s.require_touch === false ? "off" : "on"} onChange={(v) => set("require_touch", v === "on")} options={[{ value: "on", label: "Ignore untouched knob turns" }, { value: "off", label: "Off" }]} /></section></>}
          </>}
        </div>
      </div>
      {wp.node}
    </dialog>
  );
}

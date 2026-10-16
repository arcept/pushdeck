import { useEffect, useState } from "react";
import { Orb } from "./Orb";
import Brand from "./Brand";
import { useApp } from "./ctx";
import { Badge, IconGauge, IconImport, IconKeys, IconLibrary, IconLink, IconPads, IconPlus, IconRefresh, IconScreen, IconShield, IconTick, IconUsb, IconWave, PushDrawing } from "./OnbArt";
import ProfileIcon from "./ProfileIcon";
import "./onboarding.css";

// First-run setup: welcome (with the Push 2 check), permissions, Claude usage, starter profiles, then a guided tour on the real page (Tour.tsx).
// Everything can be skipped except the permissions step. Run it again from Settings → General, or add ?onboarding to the address to preview it.
const STEPS = ["Welcome", "Permissions", "Claude usage", "Profiles"] as const;
const PERM = 1, CLAUDE = 2, LAST = STEPS.length - 1;
const preview = typeof location !== "undefined" && new URLSearchParams(location.search).has("onboarding");
// the apps Push Deck sends Apple events to, and what each one is for, in plain words
const APPS: [string, string, string][] = [
  ["com.apple.systemevents", "System Events", "Part of macOS. Presses keys for your shortcuts."],
  ["com.google.Chrome", "Google Chrome", "Reads the open tab and YouTube Music."],
  ["com.spotify.client", "Spotify", "Music controls and what is playing."],
];
const dly = (ms: number) => ({ ["--d" as string]: `${ms}ms` });

export default function Onboarding() {
  const { d } = useApp();
  const s = d.settings;
  const [forced, setForced] = useState(preview);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [leaving, setLeaving] = useState<{ step: number; dir: "fwd" | "back"; out: true } | null>(null);
  useEffect(() => { if (!leaving) return; const t = window.setTimeout(() => setLeaving(null), 520); return () => clearTimeout(t); }, [leaving]);
  const [booted, setBooted] = useState(() => !!document.documentElement.dataset.booted); // wait for the splash to start leaving, so the entrance is seen
  const open = booted && (forced || (!!s && !s.onboarded));
  useEffect(() => { const f = () => setBooted(true); window.addEventListener("push-booted", f); return () => window.removeEventListener("push-booted", f); }, []);
  useEffect(() => { const f = () => { setStep(0); setForced(true); }; window.addEventListener("push-onboarding", f); return () => window.removeEventListener("push-onboarding", f); }, []);
  useEffect(() => { // on the permissions step, ask the daemon every second and a half, so the ticks appear as you allow things
    if (!open || step !== PERM) return;
    d.send({ type: "permissions" });
    const t = window.setInterval(() => d.send({ type: "permissions" }), 1500);
    return () => clearInterval(t);
  }, [open, step]); // eslint-disable-line
  if (!open) return null;

  const go = (to: number) => { // the old page slides, fades and blurs out while the new one comes in from the side you are heading to
    const n = Math.max(0, Math.min(to, LAST));
    if (n === step) return;
    const nd = n > step ? "fwd" : "back";
    setLeaving({ step, dir: nd, out: true }); setDir(nd); setStep(n);
  };
  const ax = d.permissions?.accessibility; // true | false | null (null = cannot be checked, so it never blocks)
  const permOk = ax !== false;
  const done = (tour: boolean) => {
    d.send({ type: "set_setting", key: "onboarded", value: true });
    try { localStorage.setItem("push-ui-intro-seen", "1"); } catch { /* storage unavailable */ }
    setForced(false);
    if (tour) window.setTimeout(() => window.dispatchEvent(new Event("push-tour")), 500);
  };
  const skipAll = () => (!permOk ? go(PERM) : done(false));
  const answerClaude = (on: boolean) => { d.send({ type: "set_setting", key: "claude_usage_live", value: on }); go(step + 1); };
  const pane = (p: string) => d.send({ type: "open_privacy", pane: p });

  const auto = d.permissions?.automation ?? null;
  const autoVals = auto ? Object.values(auto) : [];
  const autoState = !auto ? "" : autoVals.some((v) => v === "denied" || v === "unknown") ? "off" : auto["com.apple.systemevents"] === "granted" ? "on" : "";
  const dl = d.permissions?.downloads ?? null;
  const audio = d.media?.audio;
  const chk = audio?.check ?? "idle";
  const audioOn = chk === "heard";
  const audioNote = chk === "listening" ? "Playing a test sound and listening for it…"
    : chk === "silent" ? "Push Deck could not hear the test sound. Turn it on under System Audio Recording, then check again."
    : audio?.status === "error" || audio?.status === "unavailable" ? (audio.message || "The audio helper could not start.")
    : "";
  const pushOk = d.status.usb && d.status.midi;

  const appState = (b: string, name: string) => {
    const v = auto?.[b];
    if (v === "granted") return <span className="st ok"><IconTick size={13} />Allowed</span>;
    if (v === "unknown") return <button className="btn sm primary" onClick={() => d.send({ type: "ask_automation", bundle: b })}>Allow</button>;
    if (v === "denied") return <button className="btn sm" onClick={() => pane("automation")}>Turn on in Settings</button>;
    if (v === "not_running") return <span className="st idle" title={`Open ${name} and this checks itself`}>Checks when {name.replace("Google ", "")} is open</span>;
    return <span className="st idle">Checking…</span>;
  };

  return (
    <div className="onb" role="dialog" aria-modal="true" aria-label="Set up Push Deck">
      <div className="onbcard">
        <header>
          <Brand />
          <ol className="stepper" aria-label={`Step ${step + 1} of ${STEPS.length + 1}: ${STEPS[step]}`}>
            {[...STEPS, "Tour"].map((n, i) => (
              <li key={n} className={i === step ? "now" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
                <button disabled={i >= step} onClick={() => go(i)} aria-label={i < step ? `Go back to ${n}` : n} title={n} />
              </li>
            ))}
          </ol>
          <span className="vinfo">{__APP_VERSION__ === "dev" ? "dev build" : `v${__APP_VERSION__}`}</span>
        </header>

        <section className="onbstage">
          {[...(leaving ? [leaving] : []), { step, dir, out: false }].map(({ step: n, dir: pd, out }) => (
          <div key={n} className={"pane " + pd + (out ? " out" : " in")} aria-hidden={out || undefined}>
            {n === 0 && <>
              <div className="rise hero" style={dly(0)}><PushDrawing usb={pushOk} /></div>
              <h2 className="rise" style={dly(70)}>Welcome to Push Deck</h2>
              <p className="lead rise" style={dly(120)}>Use an Ableton Push 2 on its own, with no Ableton Live, as a controller and live display for your Mac.</p>
              <div className="trio rise" style={dly(180)}>
                <div><span className="ti"><IconPads size={22} /></span><b>Profiles per app</b><span>Pads and knobs switch by themselves as you change app.</span></div>
                <div><span className="ti"><IconScreen size={22} /></span><b>A live display</b><span>Labels, clock, usage meters and a music player.</span></div>
                <div><span className="ti"><IconShield size={22} /></span><b>All on your Mac</b><span>No account, no cloud, no tracking.</span></div>
              </div>
              <div className="conn rise" style={dly(250)}>
                <span className={"pill " + (pushOk ? "ok" : "warn")}><Orb state={pushOk ? "breathing" : "searching"} size={22} color={pushOk ? [60, 220, 120] : [255, 190, 50]} />{pushOk ? "Push 2 connected" : d.status.usb || d.status.midi ? "Push 2 partly found" : "No Push 2 found yet"}</span>
                <p className={"hint" + (pushOk ? " off" : "")} aria-hidden={pushOk}><IconUsb size={15} />Plug it in with its USB cable and switch it on, and close Ableton Live if it is open. No Push yet? You can carry on without one.</p>
              </div>
            </>}

            {n === PERM && <>
              <h2 className="rise" style={dly(0)}>Permissions</h2>
              <p className="lead wide rise" style={dly(50)}>Push Deck needs these to press keys and read what is playing. macOS asks once for each.</p>
              <div className="perms">
                <div className="perm rise" style={dly(100)}>
                  <span className={"pico " + (ax === true ? "on" : ax === false ? "off" : "")}><IconKeys size={22} /></span>
                  <div className="pbody"><b>Accessibility {ax === true && <em className="ok">allowed</em>}{ax === false && <em className="no">needed</em>}</b><p>{ax === false ? "Already switched on but still showing here? In Settings select Push Deck, press − to remove it, then + to add it again." : "Lets pads and buttons send keyboard shortcuts, type text and move windows."}</p></div>
                  {ax !== true && <button className="btn sm" onClick={() => pane("accessibility")}>Open Settings</button>}
                </div>
                <div className="perm rise" style={dly(150)}>
                  <span className={"pico " + autoState}><IconLink size={22} /></span>
                  <div className="pbody"><b>Automation {autoState === "on" && <em className="ok">allowed</em>}{autoState === "off" && <em className="no">needed</em>}</b>
                    <div className="apps">{APPS.map(([b, name, what]) => <div key={b} className="aprow"><span className="an"><b>{name}</b><small>{what}</small></span>{appState(b, name)}</div>)}</div>
                  </div>
                </div>
                <div className="perm rise" style={dly(180)}>
                  <span className={"pico " + (dl === true ? "on" : dl === false ? "off" : "")}><IconImport size={22} /></span>
                  <div className="pbody"><b>Downloads folder {dl === true && <em className="ok">allowed</em>}{dl === false && <em className="no">blocked</em>}</b>
                    <p>Shows downloads in progress on the display. It only looks for unfinished download files.</p></div>
                  {dl !== true && <div className="btns"><button className="btn sm primary" onClick={() => d.send({ type: "ask_downloads" })}>Allow</button>{dl === false && <button className="btn sm ghost" onClick={() => pane("files")}>Open Settings</button>}</div>}
                </div>
                <div className="perm rise" style={dly(230)}>
                  <span className={"pico " + (audioOn ? "on" : "")}><IconWave size={22} /></span>
                  <div className="pbody"><b>System audio <em className="opt">optional</em>{audioOn && <em className="ok">working</em>}</b>
                    <p>{audioOn || chk === "idle" ? "Only for the music visualizer. Analysed on your Mac, never recorded or sent." : audioNote}</p></div>
                  {!audioOn && <div className="btns"><button className="btn sm" disabled={chk === "listening"} onClick={() => d.send({ type: "audio_check" })}>{chk === "listening" ? "Checking…" : chk === "silent" ? "Check again" : "Check"}</button><button className="btn sm ghost" onClick={() => pane("audio")}>Open Settings</button></div>}
                </div>
              </div>
            </>}

            {n === CLAUDE && <>
              <div className="rise" style={dly(0)}><Badge tone="#ff9a3c"><IconGauge size={54} /></Badge></div>
              <h2 className="rise" style={dly(60)}>Claude usage on the display</h2>
              <p className="lead rise" style={dly(110)}>Show how much of your Claude 5-hour and weekly limits you have used, on the Push.</p>
              <div className="facts rise" style={dly(170)}>
                <div><span className="ti"><IconKeys size={18} /></span><span><b>What is read</b>The login the Claude desktop app already has on this Mac. macOS asks once.</span></div>
                <div><span className="ti"><IconLink size={18} /></span><span><b>Where it goes</b>Only to Anthropic's own usage page (api.anthropic.com). Nowhere else.</span></div>
                <div><span className="ti"><IconRefresh size={18} /></span><span><b>How often</b>About every 90 seconds, kept in memory only. Never saved or logged.</span></div>
                <div><span className="ti"><IconShield size={18} /></span><span><b>You are in control</b>Switch it off any time in Settings → General.</span></div>
              </div>
            </>}

            {n === LAST && <>
              <h2 className="rise" style={dly(0)}>Starter profiles</h2>
              <p className="lead rise" style={dly(50)}>These come with Push Deck. Each one switches on by itself when you use its app.</p>
              <div className="profs rise" style={dly(110)}>{d.profiles.map((p) => <div key={p.id} className="prof"><ProfileIcon profile={p} size={48} /><span>{p.name}</span></div>)}</div>
              <div className="trio more rise" style={dly(180)}>
                <div><span className="ti"><IconImport size={20} /></span><b>Import</b><span>Load a profile someone shared with you.</span></div>
                <div><span className="ti"><IconPlus size={20} /></span><b>Create</b><span>Make your own for any app.</span></div>
                <div><span className="ti"><IconLibrary size={20} /></span><b>Find more</b><span>A profile library is coming.</span></div>
              </div>
            </>}
          </div>))}
        </section>

        <footer>
          {step > 0 ? <button className="btn ghost" onClick={() => go(step - 1)}>Back</button> : <span />}
          <span className="grow" />
          {step === 0 && <button className="btn ghost" onClick={skipAll}>Skip setup</button>}
          {step === CLAUDE ? <><button className="btn" onClick={() => answerClaude(false)}>Not now</button><button className="btn primary" onClick={() => answerClaude(true)}>Allow</button></>
            : step === LAST ? <><button className="btn ghost" onClick={() => done(false)}>Skip the tour</button><button className="btn primary" onClick={() => done(true)}>Start the tour</button></>
            : <button className="btn primary" onClick={() => go(step + 1)} disabled={step === PERM && !permOk}>Continue</button>}
        </footer>
      </div>
    </div>
  );
}

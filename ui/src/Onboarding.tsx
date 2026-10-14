import { useEffect, useState } from "react";
import Brand from "./Brand";
import { useApp } from "./ctx";
import { Badge, IconGauge, IconImport, IconKeys, IconLibrary, IconLink, IconPads, IconPlus, IconRefresh, IconScreen, IconShield, IconTick, IconUsb, IconWave, PushDrawing } from "./OnbArt";
import ProfileIcon from "./ProfileIcon";
import "./onboarding.css";

// First-run setup: welcome, Push 2 check, permissions, Claude usage, starter profiles, then a guided tour on the real page (Tour.tsx).
// Everything can be skipped except the permissions step. Run it again from Settings → General, or add ?onboarding to the address to preview it.
const STEPS = ["Welcome", "Your Push 2", "Permissions", "Claude usage", "Profiles"] as const;
const PERM = 2, CLAUDE = 3, LAST = STEPS.length - 1;
const preview = typeof location !== "undefined" && new URLSearchParams(location.search).has("onboarding");
const APPS: Record<string, string> = { "com.google.Chrome": "Chrome", "com.spotify.client": "Spotify", "com.apple.systemevents": "System Events" };
const dly = (ms: number) => ({ ["--d" as string]: `${ms}ms` });

export default function Onboarding() {
  const { d } = useApp();
  const s = d.settings;
  const [forced, setForced] = useState(preview);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
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

  const go = (n: number) => { setDir(n > step ? "fwd" : "back"); setStep(Math.max(0, Math.min(n, LAST))); };
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

  // Automation: one tick for all the apps Push Deck controls; the chips say which app each answer is about
  const auto = d.permissions?.automation ?? null;
  const autoVals = auto ? Object.values(auto) : [];
  const autoState = !auto ? "" : autoVals.some((v) => v === "denied" || v === "unknown") ? "off" : autoVals.includes("granted") ? "on" : "";
  const audio = d.media?.audio;
  const audioOn = audio?.status === "ok";
  const chipText = (v: string) => (v === "granted" ? "allowed" : v === "denied" ? "not allowed" : v === "unknown" ? "not asked yet" : "not open");
  const pushOk = d.status.usb && d.status.midi;

  return (
    <div className="onb" role="dialog" aria-modal="true" aria-label="Set up Push Deck">
      <div className="onbcard">
        <header>
          <Brand />
          <span className="vinfo">First-time setup<i />{__APP_VERSION__ === "dev" ? "dev build" : `Version ${__APP_VERSION__}`}</span>
        </header>

        <div className="onbmain">
          <nav aria-label="Setup steps">
            <ol className="rail2">
              {[...STEPS, "Tour"].map((n, i) => (
                <li key={n} className={i === step ? "now" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
                  <button disabled={i >= step} onClick={() => go(i)} aria-label={i < step ? `Go back to ${n}` : n}><span className="num">{i < step ? <IconTick size={14} /> : i + 1}</span><em>{n}</em></button>
                </li>
              ))}
            </ol>
          </nav>

          <section className="onbstage">
            <div key={step} className={"pane " + dir}>
              {step === 0 && <>
                <div className="rise" style={dly(0)}><PushDrawing /></div>
                <h2 className="rise" style={dly(70)}>Welcome to Push Deck</h2>
                <p className="lead rise" style={dly(120)}>Use an Ableton Push 2 on its own, with no Ableton Live, as a controller and live display for your Mac.</p>
                <div className="trio rise" style={dly(190)}>
                  <div><IconPads size={26} /><b>Profiles per app</b><span>Pads and knobs switch by themselves as you change app.</span></div>
                  <div><IconScreen size={26} /><b>A live display</b><span>Labels, clock, usage meters and a music player.</span></div>
                  <div><IconShield size={26} /><b>All on your Mac</b><span>No account, no cloud, no tracking.</span></div>
                </div>
              </>}

              {step === 1 && <>
                <div className="rise" style={dly(0)}><PushDrawing usb /></div>
                <h2 className="rise" style={dly(70)}>Your Push 2</h2>
                <p className="lead rise" style={dly(120)}>Push Deck talks to the Push over USB.</p>
                <div className={"pill rise " + (pushOk ? "ok" : "warn")} style={dly(170)}>
                  <span className="dot" />{pushOk ? "Push 2 found" : d.status.usb || d.status.midi ? "Push 2 partly found" : "No Push 2 found yet"}
                </div>
                <p className="sub rise" style={dly(220)}>{pushOk ? "Everything is connected." : "Plug it into the Mac with its USB cable and switch it on. If Ableton Live is open, close it: only one app can use the Push at a time. This page notices by itself."}</p>
                <p className="hint rise" style={dly(270)}><IconUsb size={16} />No Push yet? You can carry on and edit profiles without one.</p>
              </>}

              {step === PERM && <>
                <h2 className="rise" style={dly(0)}>Permissions</h2>
                <p className="lead rise" style={dly(50)}>macOS asks for these so Push Deck can press keys for you and read what is playing. This step cannot be skipped.</p>
                <div className="perms">
                  <div className="perm rise" style={dly(100)}>
                    <span className={"pico " + (ax === true ? "on" : ax === false ? "off" : "")}><IconKeys size={22} /></span>
                    <div><b>Accessibility {ax === true && <em className="ok">allowed</em>}{ax === false && <em className="no">needed</em>}</b><p>Lets pads and buttons send keyboard shortcuts and type text.</p></div>
                    <button className="btn" onClick={() => pane("accessibility")}>Open Settings</button>
                  </div>
                  <div className="perm rise" style={dly(150)}>
                    <span className={"pico " + autoState}><IconLink size={22} /></span>
                    <div><b>Automation {autoState === "on" && <em className="ok">allowed</em>}{autoState === "off" && <em className="no">needed</em>}</b>
                      <p>Lets Push Deck read and control Spotify and Chrome.</p>
                      {auto && <div className="chips">{Object.entries(auto).map(([b, v]) => <span key={b} className={"chip " + v}>{APPS[b] ?? b}: {chipText(v)}</span>)}</div>}
                      {autoVals.length > 0 && autoVals.every((v) => v === "not_running") && <p className="tiny">Open Chrome or Spotify and this ticks by itself.</p>}</div>
                    <button className="btn" onClick={() => pane("automation")}>Open Settings</button>
                  </div>
                  <div className="perm rise" style={dly(200)}>
                    <span className={"pico " + (audioOn ? "on" : "")}><IconWave size={22} /></span>
                    <div><b>System audio <em className="opt">optional</em>{audioOn && <em className="ok">working</em>}</b>
                      <p>Only for the music visualizer. The sound is analysed on your Mac and never recorded or sent anywhere.</p>
                      {!audioOn && <p className="tiny">{audio?.status === "waiting" ? "Listening. Play some sound and this ticks." : audio?.status === "error" || audio?.status === "unavailable" ? (audio.message || "The audio helper could not start.") : audio?.status === "starting" ? "Starting the listener…" : "macOS cannot say if this is allowed. Press Check, then play some sound: it ticks once Push Deck hears it."}</p>}</div>
                    <div className="btns"><button className="btn" onClick={() => pane("audio")}>Open Settings</button><button className="btn ghost" onClick={() => d.send({ type: "audio_check" })}>Check</button></div>
                  </div>
                </div>
                {!permOk && <p className="warnline rise" style={dly(250)}>Allow Accessibility to continue. It can take a moment to show up here.</p>}
              </>}

              {step === CLAUDE && <>
                <div className="rise" style={dly(0)}><Badge tone="#ff9a3c"><IconGauge size={54} /></Badge></div>
                <h2 className="rise" style={dly(60)}>Claude usage on the display</h2>
                <p className="lead rise" style={dly(110)}>Show how much of your Claude 5-hour and weekly limits you have used, on the Push.</p>
                <div className="facts rise" style={dly(170)}>
                  <div><IconKeys size={20} /><span><b>What is read</b>The login the Claude desktop app already has on this Mac. macOS asks once.</span></div>
                  <div><IconLink size={20} /><span><b>Where it goes</b>Only to Anthropic's own usage page (api.anthropic.com). Nowhere else.</span></div>
                  <div><IconRefresh size={20} /><span><b>How often</b>About every 90 seconds, kept in memory only. Never saved or logged.</span></div>
                  <div><IconShield size={20} /><span><b>You are in control</b>Switch it off any time in Settings → General.</span></div>
                </div>
              </>}

              {step === LAST && <>
                <h2 className="rise" style={dly(0)}>Starter profiles</h2>
                <p className="lead rise" style={dly(50)}>These come with Push Deck. Each one switches on by itself when you use its app.</p>
                <div className="profs rise" style={dly(110)}>{d.profiles.map((p) => <div key={p.id} className="prof"><ProfileIcon profile={p} size={44} /><span>{p.name}</span></div>)}</div>
                <div className="more rise" style={dly(180)}>
                  <div><IconImport size={20} /><span><b>Import</b>Load a profile someone shared with you.</span></div>
                  <div><IconPlus size={20} /><span><b>Create</b>Make your own for any app.</span></div>
                  <div><IconLibrary size={20} /><span><b>Find more</b>A profile library is coming.</span></div>
                </div>
              </>}
            </div>
          </section>
        </div>

        <footer>
          {step > 0 ? <button className="btn ghost" onClick={() => go(step - 1)}>Back</button> : <span />}
          <span className="grow" />
          {step !== PERM && step !== CLAUDE && step !== LAST && <button className="btn ghost" onClick={skipAll}>Skip setup</button>}
          {step === CLAUDE ? <><button className="btn" onClick={() => answerClaude(false)}>Not now</button><button className="btn primary" onClick={() => answerClaude(true)}>Allow</button></>
            : step === LAST ? <><button className="btn ghost" onClick={() => done(false)}>Skip the tour</button><button className="btn primary" onClick={() => done(true)}>Start the tour</button></>
            : <button className="btn primary" onClick={() => go(step + 1)} disabled={step === PERM && !permOk}>Continue</button>}
        </footer>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import Brand from "./Brand";
import { useApp } from "./ctx";
import "./onboarding.css";

// First-run setup: welcome, Push 2 check, permissions, Claude usage, starter profiles, a short tour.
// Everything can be skipped except the permissions step. Run it again from Settings → General, or add ?onboarding to the address to preview it.
const STEPS = ["Welcome", "Your Push 2", "Permissions", "Claude usage", "Profiles", "All set"] as const;
const PERM = 2;
const preview = typeof location !== "undefined" && new URLSearchParams(location.search).has("onboarding");

export default function Onboarding() {
  const { d } = useApp();
  const s = d.settings;
  const [forced, setForced] = useState(preview);
  const [step, setStep] = useState(0);
  const [claude, setClaude] = useState<"allow" | "no" | null>(null);
  const open = forced || (!!s && !s.onboarded);
  useEffect(() => { const f = () => { setStep(0); setClaude(null); setForced(true); }; window.addEventListener("push-onboarding", f); return () => window.removeEventListener("push-onboarding", f); }, []);
  useEffect(() => { // while the permissions step is showing, ask the daemon every second and a half, so the tick appears when you allow it
    if (!open || step !== PERM) return;
    d.send({ type: "permissions" });
    const t = window.setInterval(() => d.send({ type: "permissions" }), 1500);
    return () => clearInterval(t);
  }, [open, step]); // eslint-disable-line
  if (!open) return null;

  const ax = d.permissions?.accessibility; // true | false | null (null = cannot be checked, so it never blocks)
  const permOk = ax !== false;
  const finish = () => {
    d.send({ type: "set_setting", key: "onboarded", value: true });
    try { localStorage.setItem("push-ui-intro-seen", "1"); } catch { /* storage unavailable */ }
    setForced(false);
  };
  const next = () => setStep((n) => Math.min(n + 1, STEPS.length - 1));
  const skipAll = () => (step < PERM && !permOk ? setStep(PERM) : step >= PERM ? finish() : setStep(STEPS.length - 1));
  const allowClaude = (on: boolean) => { d.send({ type: "set_setting", key: "claude_usage_live", value: on }); setClaude(on ? "allow" : "no"); next(); };
  const pane = (p: string) => d.send({ type: "open_privacy", pane: p });
  const last = step === STEPS.length - 1;

  return (
    <div className="onb" role="dialog" aria-modal="true" aria-label="Set up Push Deck">
      <div className="onbcard">
        <header>
          <Brand />
          <ol className="onbsteps" aria-label="Setup steps">{STEPS.map((n, i) => <li key={n} className={i === step ? "now" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}><span>{i < step ? "✓" : i + 1}</span><em>{n}</em></li>)}</ol>
        </header>

        <div className="onbbody">
          {step === 0 && <>
            <h2>Welcome to Push Deck</h2>
            <p className="lead">Use an Ableton Push 2 on its own, with no Ableton Live, as a controller and live display for your Mac.</p>
            <ul className="points">
              <li><b>Profiles per app.</b> Pads and knobs run shortcuts, open apps and sites, and switch by themselves when you change app.</li>
              <li><b>A live display.</b> Labels, a clock, usage meters and a music player on the Push's screen.</li>
              <li><b>All on your Mac.</b> No account, no cloud, no tracking.</li>
            </ul>
            <p className="muted">This takes about a minute. You can skip most of it, and run it again from Settings.</p>
          </>}

          {step === 1 && <>
            <h2>Your Push 2</h2>
            <p className="lead">Push Deck talks to the Push over USB.</p>
            <div className={"statusbox " + (d.status.usb && d.status.midi ? "ok" : "warn")}>
              <span className="dot" />
              <div>
                <b>{d.status.usb && d.status.midi ? "Push 2 found" : d.status.usb || d.status.midi ? "Push 2 partly found" : "No Push 2 found yet"}</b>
                <p>{d.status.usb && d.status.midi ? "Everything is connected." : "Plug it into the Mac with its USB cable and switch it on. If Ableton Live is open, close it, because only one app can use the Push at a time. This page notices by itself."}</p>
              </div>
            </div>
            <p className="muted">No Push yet? You can carry on and edit profiles without one.</p>
          </>}

          {step === PERM && <>
            <h2>Permissions</h2>
            <p className="lead">macOS asks for these so Push Deck can press keys for you and read what is playing. This step cannot be skipped.</p>
            <div className="perms">
              <div className="perm">
                <span className={"tick " + (ax === true ? "on" : ax === false ? "off" : "")}>{ax === true ? "✓" : ""}</span>
                <div><b>Accessibility</b><p>Lets pads and buttons send keyboard shortcuts and type text. {ax === true ? "Allowed." : ax === false ? "Not allowed yet: switch Push Deck on in the list." : ""}</p></div>
                <button className="btn" onClick={() => pane("accessibility")}>Open System Settings</button>
              </div>
              <div className="perm">
                <span className="tick" />
                <div><b>Automation</b><p>Lets Push Deck read and control Spotify and Chrome. macOS asks the first time you use them; you can also check it here.</p></div>
                <button className="btn" onClick={() => pane("automation")}>Open System Settings</button>
              </div>
              <div className="perm">
                <span className="tick" />
                <div><b>System audio</b><p>Optional. Only for the music visualizer. The sound is analysed on your Mac and never recorded or sent anywhere.</p></div>
                <button className="btn" onClick={() => pane("audio")}>Open System Settings</button>
              </div>
            </div>
            {!permOk && <p className="warnline">Allow Accessibility to continue. It can take a moment to show up here.</p>}
          </>}

          {step === 3 && <>
            <h2>Claude usage on the display</h2>
            <p className="lead">Show how much of your Claude 5-hour and weekly limits you have used, on the Push.</p>
            <ul className="points">
              <li><b>What is read:</b> the login the Claude desktop app already has on this Mac. macOS asks once to open its Keychain entry.</li>
              <li><b>Where it goes:</b> only to Anthropic's own usage page (api.anthropic.com), about every 90 seconds. Nowhere else.</li>
              <li><b>How it is kept:</b> in memory only. It is never saved to a file or logged, and never refreshed by Push Deck.</li>
              <li><b>Switch off any time:</b> Settings → General.</li>
            </ul>
            {claude && <p className="muted">{claude === "allow" ? "Allowed." : "Not now. You can turn it on later in Settings."}</p>}
          </>}

          {step === 4 && <>
            <h2>Starter profiles</h2>
            <p className="lead">These come with Push Deck. Each one switches on by itself when you use its app. Edit, rename or delete them any time.</p>
            <div className="profs">{d.profiles.map((p) => <div key={p.id} className="prof"><i style={{ background: p.theme?.accent || "#999" }} />{p.name}</div>)}</div>
          </>}

          {step === 5 && <>
            <h2>You're all set</h2>
            <p className="lead">A quick look around the page:</p>
            <div className="tour">
              <div><span className="n">1</span><b>Profiles</b><span>On the left: your profiles and their settings.</span></div>
              <div><span className="n">2</span><b>Your Push</b><span>In the middle: a live copy of the device. Click any pad, button or knob to set it up.</span></div>
              <div><span className="n">3</span><b>Selected control</b><span>On the right: what that control does. Drag actions from the list onto the Push.</span></div>
            </div>
          </>}
        </div>

        <footer>
          {step > 0 ? <button className="btn ghost" onClick={() => setStep((n) => n - 1)}>Back</button> : <span />}
          <span className="grow" />
          {!last && step !== PERM && step !== 3 && <button className="btn ghost" onClick={skipAll}>Skip setup</button>}
          {step === 3 ? <><button className="btn" onClick={() => allowClaude(false)}>Not now</button><button className="btn primary" onClick={() => allowClaude(true)}>Allow</button></>
            : last ? <button className="btn primary" onClick={finish}>Start using Push Deck</button>
            : <button className="btn primary" onClick={next} disabled={step === PERM && !permOk}>Continue</button>}
        </footer>
      </div>
    </div>
  );
}

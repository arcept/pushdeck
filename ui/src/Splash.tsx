import { useEffect, useMemo, useRef, useState } from "react";
import Brand from "./Brand";
import "./splash.css";

// The launch splash (Photoshop style): a black text panel on the left, an illustration on the right.
// Drop your artwork at ui/src/assets/splash-art.png (or .jpg / .webp) and it replaces the placeholder tiles automatically.
// Add ?nosplash to the address to skip it while developing, or ?splashhold to keep it on screen. Click or press any key to skip.
const art = Object.values(import.meta.glob("./assets/splash-art.*", { eager: true, query: "?url", import: "default" }))[0] as string | undefined;
const ART_CREDIT = ""; // e.g. "Artwork by Jane Doe": shown under the name once the artwork is in

const PAD = ["#4f8cff", "#ff9a3c", "#a06bff", "#2fc8b8", "#ff5fa8", "#3cdc78", "#ffc93c", "#ff5a5a"];
const MIN_LINE_MS = 380, HOLD_MS = 550, FADE_MS = 450;
const qs = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const hold = qs.has("splashhold");
// In the Mac app the splash is its own small window (?splashwin) and the main window (?shell) waits behind it for the app to say go.
// In a browser neither is set, and the splash sits on top of the page as before.
const splashwin = qs.has("splashwin"), shell = qs.has("shell");
const released = () => { try { return !!sessionStorage.getItem("push-shell-released"); } catch { return false; } };
const skip = qs.has("nosplash") || shell;
const booted = () => { // the page behind fades in; the setup (if any) starts
  if (splashwin) { (window as unknown as { webkit?: { messageHandlers?: { splashDone?: { postMessage: (v: number) => void } } } }).webkit?.messageHandlers?.splashDone?.postMessage(1); return; }
  document.documentElement.dataset.booted = "1"; window.dispatchEvent(new Event("push-booted"));
};
if (typeof document !== "undefined") {
  if (qs.has("nosplash") || (shell && released())) document.documentElement.dataset.booted = "1";
  if (splashwin) document.documentElement.classList.add("splashwin");
}

export default function Splash({ connected, hello, usb, profiles }: { connected: boolean; hello: boolean; usb: boolean; profiles: number }) {
  const [gone, setGone] = useState(skip);
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(0);
  const lines = useMemo(() => [
    "Starting the daemon…",
    "Daemon connected",
    usb ? "Push 2 found" : "No Push 2 found, carrying on",
    `${profiles} profile${profiles === 1 ? "" : "s"} loaded`,
    "Ready",
  ], [usb, profiles]);
  const target = !connected ? 0 : !hello ? 1 : lines.length - 1;
  const leave = useRef(() => {});
  leave.current = () => { if (!leaving) { setLeaving(true); booted(); window.setTimeout(() => setGone(true), FADE_MS); } };

  useEffect(() => { // walk the status line forward, one step at a time
    if (shown >= target) return;
    const t = window.setTimeout(() => setShown((s) => s + 1), MIN_LINE_MS);
    return () => clearTimeout(t);
  }, [shown, target]);
  useEffect(() => { // all steps shown: hold a moment, then fade out
    if (shown < lines.length - 1 || hold) return;
    const t = window.setTimeout(() => leave.current(), HOLD_MS);
    return () => clearTimeout(t);
  }, [shown, lines.length]);
  useEffect(() => {
    if (gone) return;
    const k = () => leave.current();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [gone]);
  if (gone) return null;

  const lit = Math.round((shown / (lines.length - 1)) * 8); // the pads are the progress bar

  return (
    <div className={"splash" + (leaving ? " leaving" : "")} role="dialog" aria-label="Push Deck is starting" onClick={() => leave.current()}>
      <div className="splashcard">
        <div className="splashleft">
          <h1 className="splashname"><Brand stacked /></h1>

          <div className="splashinfo">
            <p className="tag">Your Push 2, your desk, your rules.</p>
            {art && ART_CREDIT && <p className="credit">{ART_CREDIT}</p>}
            <p className="legal">© 2026 Arcept. MIT licence.<br />Independent project, not affiliated with Ableton.</p>
            <p className="status" aria-live="polite">{lines[shown]}</p>
          </div>

          <div className="splashbottom">
            <div className="padbar" aria-hidden="true">
              {PAD.map((c, i) => <i key={i} className={i < lit ? "on" : ""} style={{ ["--c" as string]: c }} />)}
            </div>
            <span className="ver">{__APP_VERSION__ === "dev" ? "dev" : `v${__APP_VERSION__}`}</span>
          </div>
        </div>

        <div className="splashright" aria-hidden="true">
          {art ? <img src={art} alt="" /> : (
            <div className="artph">
              <div className="tiles">{Array.from({ length: 36 }, (_, i) => {
                const c = i % 6, r = Math.floor(i / 6);
                return <i key={i} style={{ ["--c" as string]: PAD[(c * 3 + r * 5) % 8], animationDelay: `${(c + r) * 160}ms` }} />;
              })}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

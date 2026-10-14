import { useEffect, useMemo, useRef, useState } from "react";
import "./splash.css";

// The launch splash (Photoshop style): logo, animated pads, version, a status line and credits on the left, an illustration on the right.
// Drop your artwork at ui/src/assets/splash-art.png (or .jpg / .webp) and it replaces the placeholder pads automatically.
// Add ?nosplash to the address to skip it while developing, or ?splashhold to keep it on screen. Click or press any key to skip.
const art = Object.values(import.meta.glob("./assets/splash-art.{png,jpg,jpeg,webp}", { eager: true, query: "?url", import: "default" }))[0] as string | undefined;

const PAD = ["#4f8cff", "#ff9a3c", "#a06bff", "#2fc8b8", "#ff5fa8", "#3cdc78", "#ffc93c", "#ff5a5a"];
const MIN_LINE_MS = 380, HOLD_MS = 550, FADE_MS = 450;
const qs = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const skip = qs.has("nosplash"), hold = qs.has("splashhold");

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
  leave.current = () => { if (!leaving) { setLeaving(true); window.setTimeout(() => setGone(true), FADE_MS); } };

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

  return (
    <div className={"splash" + (leaving ? " leaving" : "")} role="dialog" aria-label="Push Deck is starting" onClick={() => leave.current()}>
      <div className="splashcard">
        <div className="splashleft">
          <img className="splashlogo" src="/favicon.svg" alt="" width={64} height={64} />
          <h1>Push Deck</h1>
          <p className="tag">Your Push 2, your desk, your rules.</p>
          <div className="splashpads" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => {
              const c = i % 8, r = Math.floor(i / 8);
              return <i key={i} style={{ ["--c" as string]: PAD[c], animationDelay: `${(c + r) * 90}ms` }} />;
            })}
          </div>
          <div className="splashfoot">
            <div className="status" aria-live="polite"><span className="dot" />{lines[shown]}</div>
            <div className="bar"><i style={{ width: `${(shown / (lines.length - 1)) * 100}%` }} /></div>
            <div className="meta"><span>Version {__APP_VERSION__}</span><span>Made by Arcept · MIT licence</span></div>
            <div className="meta dim">Independent project. Not affiliated with Ableton.</div>
          </div>
        </div>
        <div className="splashright" aria-hidden="true">
          {art ? <img src={art} alt="" /> : (
            <div className="artph">{Array.from({ length: 64 }, (_, i) => {
              const c = i % 8, r = Math.floor(i / 8);
              return <i key={i} style={{ ["--c" as string]: PAD[(c + r) % 8], animationDelay: `${(Math.abs(c - 3.5) + Math.abs(r - 3.5)) * 140}ms` }} />;
            })}</div>
          )}
        </div>
      </div>
    </div>
  );
}

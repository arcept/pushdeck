import { useEffect, useState } from "react";
import { Icon } from "./icons";

const KEY = "push-ui-intro-seen";
const seen = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

// A one-time orientation card: what the three columns are for. Reopen it from the command palette (⌘K → "How this page works").
export default function Intro() {
  const [open, setOpen] = useState(() => !seen());
  useEffect(() => { const f = () => setOpen(true); window.addEventListener("push-intro", f); return () => window.removeEventListener("push-intro", f); }, []);
  if (!open) return null;
  const close = () => { try { localStorage.setItem(KEY, "1"); } catch { /* storage unavailable */ } setOpen(false); };
  return (
    <aside className="intro" role="region" aria-label="How this page works">
      <div className="introgrid">
        <div><span className="n">1</span><b>Profile</b><span>On the left: the settings of the profile you picked at the top. Name, colour, which apps turn it on.</span></div>
        <div><span className="n">2</span><b>Your Push</b><span>In the middle: a live copy of the device. Click any pad, button or knob to set it up.</span></div>
        <div><span className="n">3</span><b>Selected control</b><span>On the right: what that one control does. Drag actions from the list onto the Push.</span></div>
      </div>
      <button className="btn primary sm" onClick={close}><Icon name="check" size={14} />Got it</button>
    </aside>
  );
}

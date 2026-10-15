import { useState } from "react";
import { useApp } from "./ctx";
import { Icon } from "./icons";
import { Orb } from "./Orb";

// Shown above the Push picture when the daemon is running but the device isn't there. Editing still works.
export default function NoPush() {
  const { d, openSettings } = useApp();
  const [open, setOpen] = useState(false);
  if (!d.connected || d.standby || d.status.usb || d.status.midi) return null;
  return (
    <div className="nopush" role="status">
      <div className="nophead">
        <span className="noicon"><Orb state="connecting" size={30} /></span>
        <div className="notext"><b>Your Push isn't connected</b><span>You can keep editing profiles here. Changes reach the Push when it's back.</span></div>
        <button className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Troubleshoot"}</button>
      </div>
      {open && <div className="nosteps">
        <ol>
          <li><b>Plug it in.</b> Connect the Push to your Mac with its USB cable, directly or through a hub that has power.</li>
          <li><b>Turn it on.</b> If the screen is dark, press any button or connect the power adapter.</li>
          <li><b>Free it up.</b> Quit Ableton Live or any other app that is using the Push.</li>
          <li><b>Wait a moment.</b> This page finds it by itself, no need to refresh.</li>
        </ol>
        <button className="btn sm ghost" onClick={() => openSettings("device")}><Icon name="sliders" size={14} />Check connection details</button>
      </div>}
    </div>
  );
}

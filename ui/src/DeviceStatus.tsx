import { Icon } from "./icons";
import { useApp } from "./ctx";
import { ConfirmButton } from "./ui";

// Floating connection status and the Push on/off control, bottom right.
export default function DeviceStatus() {
  const { d } = useApp();
  const s = !d.connected ? { dot: "bad", text: "Daemon offline" } : d.standby ? { dot: "warn", text: "Push turned off" } : !d.status.usb && !d.status.midi ? { dot: "bad", text: "Push not connected" } : !d.status.usb ? { dot: "bad", text: "USB unplugged" } : !d.status.midi ? { dot: "warn", text: "MIDI missing" } : { dot: "good", text: "Push 2 connected" };
  return (
    <div className="devfloat" role="status">
      <span className="statustext"><span className={`dot ${s.dot}`} />{s.text}</span>
      {!d.standby && d.connected && !d.status.usb && !d.status.midi ? null  // nothing to turn off while the Push isn't there
        : d.standby
        ? <button className="btn settingsbtn primary" onClick={() => d.send({ type: "standby", on: false })}><Icon name="power" size={14} />Turn Push on</button>
        : <ConfirmButton className="settingsbtn" label="Turn Push off" armedLabel="Confirm turn off" icon="power" disabled={!d.connected} onConfirm={() => d.send({ type: "standby", on: true })} />}
    </div>
  );
}

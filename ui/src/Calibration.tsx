import { useState } from "react";
import { Icon } from "./icons";
import { ConfirmButton } from "./ui";
import type { Calibration, TestState } from "./daemon";

export const DEFAULT_CAL: Calibration = { red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255], saturation: 1 };
const rgb = (c: number[]) => `rgb(${c.join(",")})`;
export const isDefaultCal = (c: Calibration) => JSON.stringify(c) === JSON.stringify(DEFAULT_CAL);

// Colour calibration page (inside Settings): the saved values and the tests that set them.
export default function CalibrationPanel({ cal, test, send }: { cal: Calibration; test: TestState; send: (m: object) => void }) {
  const busy = test.state === "running";
  const run = (name: string) => send({ type: "run_test", name });
  return (
    <>
      {busy && <p className="runnote">Look at your Push: press the button under the swatch that looks truest. You can close this panel while it runs.</p>}
      <div className="row between wrap" style={{ marginBottom: 6 }}>
        <button className="btn primary" disabled={busy} onClick={() => run("cal_all")}><Icon name="play" size={15} />{busy ? "Running…" : "Run the guided test"}</button>
        <span className={`chipbadge ${isDefaultCal(cal) ? "" : "accent"}`}>{isDefaultCal(cal) ? "Default" : "Customised"}</span>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>Pick the truest red, green and blue on the Push's display, then the saturation. Hold <span className="kbd">Shift</span> + <span className="kbd">Setup</span> on the Push to start it any time.</p>
      <div className="calrows">
        {([["Red", "red", "cal_red"], ["Green", "green", "cal_green"], ["Blue", "blue", "cal_blue"]] as const).map(([n, k, t]) => (
          <div key={k} className="calrow"><span className="chipdot" style={{ background: rgb(cal[k]) }} /><span className="nm">{n}</span><code className="muted">{cal[k].join(", ")}</code>
            <button className="btn ghost sm" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => run(t)}>Redo</button></div>))}
        <div className="calrow"><span className="chipdot sat" /><span className="nm">Saturation</span><code className="muted">×{cal.saturation.toFixed(2)}</code>
          <button className="btn ghost sm" style={{ marginLeft: "auto" }} disabled={busy} onClick={() => run("cal_saturation")}>Redo</button></div>
      </div>
      <div className="field"><label htmlFor="sat">Saturation, live</label>
        <input id="sat" type="range" min={1} max={2} step={0.05} value={cal.saturation} onChange={(e) => send({ type: "set_setting", key: "calibration", value: { ...cal, saturation: +e.target.value } })} /></div>
      <ConfirmButton label="Reset to default" armedLabel="Confirm reset" icon="reset" disabled={isDefaultCal(cal) || busy} onConfirm={() => send({ type: "set_setting", key: "calibration", value: DEFAULT_CAL })} />
      {test.name?.startsWith("cal_") && test.state === "done" && <p className={`muted ${test.ok ? "" : ""}`} style={{ marginTop: 14 }}>{test.ok ? "Saved: " : "Not saved: "}{test.summary}</p>}
    </>
  );
}

import { useApp } from "./ctx";
import { Field, Select, Switch } from "./ui";

const START: [string, string][] = [["50", "50%"], ["60", "60%"], ["70", "70%"], ["80", "80%"], ["90", "90%"], ["100", "Only at 100%"]];
const STEP: [string, string][] = [["5", "Every 5%"], ["10", "Every 10%"], ["25", "Every 25%"], ["100", "Only at 100%"]];

// Settings → General: when the Push tells you a Claude (or Codex) limit is running out, and when Claude has a question for you.
export default function ClaudeAlerts() {
  const { d } = useApp();
  const s = d.settings;
  if (!s) return null;
  const la = s.limit_alert ?? {}, on = la.on !== false, wins = la.windows ?? ["five_hour", "seven_day"];
  const setLimit = (patch: object) => d.send({ type: "set_setting", key: "limit_alert", value: { ...la, ...patch } });
  const toggleWin = (w: string, v: boolean) => setLimit({ windows: v ? [...new Set([...wins, w])] : wins.filter((x) => x !== w) });
  const row = (label: string, hint: string, child: React.ReactNode) => <Field label={label} hint={hint}>{child}</Field>;
  return (<>
    <h3 style={{ marginTop: 26 }}>Claude alerts</h3>
    <p className="muted" style={{ marginTop: 0 }}>The full-screen alert, pad ripple and chime when a usage limit gets close, and when Claude has a question for you.</p>
    {row("Usage limit alerts", "When a 5-hour or weekly limit reaches a level, the display shows a full-screen alert. Each level is announced once. It stays up for a minute or until you press a button.",
      <Switch checked={on} onChange={(v) => setLimit({ on: v })} label={<span className="sr">Usage limit alerts</span>} />)}
    {on && <>
      {row("First alert at", "The first level that alerts you. 100% means only when the limit is used up.", <Select value={String(la.start ?? 70)} onChange={(v) => setLimit({ start: +v })} options={START} ariaLabel="First alert at" />)}
      {row("Then", "How often it alerts after that, up to 100%.", <Select value={String(la.step ?? 5)} onChange={(v) => setLimit({ step: +v })} options={STEP} ariaLabel="Then" />)}
      {row("5-hour limit", "Alert for the limit that resets every five hours.", <Switch checked={wins.includes("five_hour")} onChange={(v) => toggleWin("five_hour", v)} label={<span className="sr">5-hour limit alerts</span>} />)}
      {row("Weekly limit", "Alert for the weekly limit.", <Switch checked={wins.includes("seven_day")} onChange={(v) => toggleWin("seven_day", v)} label={<span className="sr">Weekly limit alerts</span>} />)}
      {row("Chime", "A low chime when an alert appears.", <Switch checked={la.sound !== false} onChange={(v) => setLimit({ sound: v })} label={<span className="sr">Alert chime</span>} />)}
      {row("Pad ripple", "The pads ripple for a few seconds when an alert appears.", <Switch checked={la.pads !== false} onChange={(v) => setLimit({ pads: v })} label={<span className="sr">Pad ripple</span>} />)}
      <div className="wrow" style={{ margin: "6px 0 14px" }}><span>See what the alerts look like</span>
        <div className="wpills"><button onClick={() => d.send({ type: "limit_preview", window: "five_hour", pct: 85 })}>Preview 5-hour</button><button onClick={() => d.send({ type: "limit_preview", window: "seven_day", pct: 90 })}>Preview weekly</button></div></div>
    </>}
    {row("Question alerts", "When Claude is waiting on a question card and you are in another app.", <Switch checked={s.ask_alert?.on !== false} onChange={(v) => d.send({ type: "set_setting", key: "ask_alert", value: { ...s.ask_alert, on: v } })} label={<span className="sr">Question alerts</span>} />)}
  </>);
}

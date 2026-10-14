import { Icon } from "./icons";
import Brand from "./Brand";
import { useApp } from "./ctx";
import { Popover, Seg, Tip } from "./ui";
import DeviceStatus from "./DeviceStatus";

const TONES: { value: "warm" | "graphite"; label: string; sw: string }[] = [
  { value: "warm", label: "Warm", sw: "#3a3029" }, { value: "graphite", label: "Graphite", sw: "#2c2f34" }];

function Appearance() {
  const { look, setLook, fx, setFx, tone, setTone } = useApp();
  return (
    <div className="appear" role="dialog" aria-label="Appearance">
      <div className="ap-row"><span className="ap-lab">Look</span>
        <Seg label="Look" value={look} onChange={setLook} options={[{ value: "showpiece", label: "Showpiece" }, { value: "simple", label: "Simple" }, { value: "instrument", label: "Instrument" }]} /></div>
      <p className="ap-hint">{look === "showpiece" ? "The device lit like a product shot: warm key light, big type, floating panels." : look === "simple" ? "The classic flat layout. No lighting or textures." : "Precise and calm: engraved legends, brushed panels, cool light."}</p>
      <>
        <div className="ap-row"><span className="ap-lab">Colour</span>
          <div className="tones" role="radiogroup" aria-label="Showpiece colour">
            {TONES.map((t) => <button key={t.value} role="radio" aria-checked={tone === t.value} className="tone" title={t.value === "warm" ? "Warm graphite with a warm key light" : "Cool grey with a neutral key light"} onClick={() => setTone(t.value)}><span style={{ background: t.sw }} />{t.label}</button>)}
          </div></div>
        <p className="ap-hint">The colour of the panels, the room and its light.</p></>
      <div className={`ap-row ${look === "simple" ? "off" : ""}`}><span className="ap-lab">Light</span>
        <Seg label="Light" value={fx} onChange={setFx} options={[{ value: "ambient", label: "Ambient" }, { value: "reactive", label: "Reactive" }, { value: "off", label: "Still" }]} /></div>
      <p className="ap-hint">{look === "simple" ? "Simple has no lighting." : fx === "reactive" ? "Pressing or turning anything sends its light across the room." : fx === "ambient" ? "A slow, living haze and grain. Never reacts to input." : "Grain and light, no movement."}</p>
    </div>);
}

export default function TopBar() {
  const { openSettings, openPalette } = useApp();
  return (
    <header className="topbar">
      <div className="tb-left">
        <Brand />
      </div>

      <button className="searchbtn hide-sm" onClick={openPalette} aria-label="Search profiles, controls, tests and settings">
        <Icon name="search" size={18} /><span>Search profiles, controls, tests, settings</span><span className="kbd">⌘K</span>
      </button>

      <div className="tb-right">
        <DeviceStatus />
        <Popover align="right" trigger={({ toggle, open }) => (
          <button className="btn settingsbtn" onClick={toggle} aria-expanded={open} aria-haspopup="dialog"><Icon name="eye" size={17} /><span className="lbl2">Appearance</span></button>)}>
          {() => <Appearance />}
        </Popover>
        <Tip align="right" title="Device settings" desc="Knobs, display and lights, colour calibration, tests, and about.">
          <button className="btn settingsbtn" onClick={() => openSettings()}><Icon name="gear" size={17} /><span className="lbl2">Settings</span></button>
        </Tip>
      </div>
    </header>
  );
}

import Inspector from "./Inspector";
import ActionLibrary from "./ActionLibrary";
import { WidgetsPanel } from "./DisplayEditor";
import { Icon } from "./icons";
import { useLayout, type RightMode } from "./layoutCtx";

const TABS: { id: RightMode; label: string; icon: "sliders" | "grid" }[] = [{ id: "controls", label: "Controls", icon: "sliders" }, { id: "widgets", label: "Widgets", icon: "grid" }];

// Right column: a header bar switches between the controls (what a pad or button does) and the widgets (what the Push screen shows).
export default function RightColumn() {
  const { ed, mode, setMode } = useLayout();
  return (
    <div className="rightcol">
      <div className="rtabs" role="tablist" aria-label="Right column">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={mode === t.id} className={mode === t.id ? "on" : ""} onClick={() => setMode(t.id)}><Icon name={t.icon} size={17} />{t.label}</button>)}
      </div>
      {mode === "controls" ? <><Inspector /><ActionLibrary /></> : <WidgetsPanel ed={ed} />}
    </div>
  );
}

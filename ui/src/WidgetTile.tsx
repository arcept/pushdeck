import { useEffect, useRef } from "react";
import { loadFonts, paint, SCALE, H, W, type Icons } from "./display/render";
import { setDragged } from "./DisplayEditor";
import { reach, type Proto } from "./layoutModel";
import { sampleSpec, type Look } from "./widgetSamples";

let off: HTMLCanvasElement | null = null;

// One size of one widget, drawn by the display's own renderer with made-up data, with the buttons it brings above and below it.
// Dragging it onto the screen shows this picture under the pointer; the name is written outside, under it.
export default function WidgetTile({ p, icons, name, accent, icon, look, disabled, onAdd }: { p: Proto; icons: Icons; name: string; accent: string; icon: string; look: Look; disabled?: boolean; onAdd: () => void }) {
  const up = useRef<HTMLCanvasElement>(null), bd = useRef<HTMLCanvasElement>(null), dn = useRef<HTMLCanvasElement>(null);
  const m = p.make();
  const r = reach(m);
  const full = m.type === "browser";   // it draws over its buttons' rows too: one picture, one outline around the whole height
  const cw = m.w * 120, body = m.h * 50;
  useEffect(() => {
    let dead = false;
    const go = () => {
      if (dead || !bd.current) return;
      off = off ?? Object.assign(document.createElement("canvas"), { width: W * SCALE, height: H * SCALE });
      paint(off.getContext("2d")!, icons, sampleSpec(p, { name, accent, icon }, look));
      // the widget is drawn at true scale in its own box; the buttons it brings sit just outside it, above and below
      const piece = (c: HTMLCanvasElement | null, sy: number, h: number) => { if (!c) return; c.width = cw * SCALE; c.height = h * SCALE; c.getContext("2d")!.drawImage(off!, 0, sy * SCALE, cw * SCALE, h * SCALE, 0, 0, cw * SCALE, h * SCALE); };
      if (full) piece(bd.current, 0, 160); else { piece(up.current, 0, 30); piece(bd.current, 30, body); piece(dn.current, 130, 30); }
    };
    go(); loadFonts().then(go);
    const t = [250, 900].map((ms) => window.setTimeout(go, ms));   // artwork and icons arrive a moment later
    const moving = m.type === "claude_session" ? window.setInterval(() => { if (!document.hidden) go(); }, 66) : 0;   // the Claude session tiles keep moving, like on the Push
    return () => { dead = true; t.forEach(clearTimeout); if (moving) clearInterval(moving); };
  }, [p.id, name, accent, icon, icons, r.up, r.down, look.bar, look.mascot]); // eslint-disable-line
  return (
    <div className={`wvar ${disabled ? "off" : ""}`}>
      <button className="wvis" draggable={!disabled} aria-label={`${p.group}, ${p.cap}, ${m.w} by ${m.h}`} title={disabled ? "Customize this profile first" : "Drag onto the screen, or click to add"}
        style={{ ["--c" as string]: cw / 120 }}
        onDragStart={(e) => { const r = e.currentTarget.getBoundingClientRect(); setDragged(p, { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height }); e.dataTransfer.setData("text/x-widget", p.id); e.dataTransfer.effectAllowed = "copy"; }} onDragEnd={() => setDragged(null)}
        onClick={() => !disabled && onAdd()}>
        {r.up && !full && <canvas ref={up} className="wstrip" />}
        <canvas ref={bd} className="wbodycv" />
        {r.down && !full && <canvas ref={dn} className="wstrip" />}
      </button>
      <span className="wcap">{p.cap}<small>{`${m.w} × ${m.h}`}</small></span>
    </div>);
}

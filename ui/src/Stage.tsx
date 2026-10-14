import { useRef, useState } from "react";
import { draw, loadFonts } from "./display/render";
import { useEffect } from "react";
import { Icon } from "./icons";
import { useApp } from "./ctx";
import Replica from "./Replica";
import Rings from "./Rings";
import NoPush from "./NoPush";
import { SCENE_IDS, controlKind, describeControl } from "./model";
import QuickPop from "./QuickPop";
import EditMode from "./EditMode";
import { pulseAt } from "./Backdrop";
import { Seg, Stable, Switch, Tip } from "./ui";
import { isActive, useActive } from "./activity";
import { Grid } from "./DisplayEditor";
import { useLayout } from "./layoutCtx";

export default function Stage() {
  const { d, profile, selected, setSelected, updateControl, listen, setListen, nudgeKnob } = useApp();
  const [mirror, setMirror] = useState<"render" | "stream" | "off">("render");
  const [paused, setPaused] = useState(false);
  const active = useActive();
  const [overlay, setOverlay] = useState<SVGGElement | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [pop, setPop] = useState<{ id: string; rect: DOMRect } | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const { ed, mode } = useLayout();
  const arranging = mode === "widgets";
  const col = useRef<HTMLDivElement | null>(null);
  const [dbox, setDbox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!arranging) return;
    const measure = () => { const c = canvas.current, p = col.current; if (!c || !p) return; const a = c.getBoundingClientRect(), b = p.getBoundingClientRect(); setDbox({ left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height }); };
    measure(); const ro = new ResizeObserver(measure); if (col.current) ro.observe(col.current); window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [arranging]);
  const pausedRef = useRef(false); pausedRef.current = paused;

  useEffect(() => { loadFonts(); }, []);
  // "Show assigned only": dim every pad and button that has nothing set up in this profile
  useEffect(() => {
    document.querySelectorAll<SVGGElement>(".replica g.control").forEach((g) => {
      const c = profile?.controls[g.id], on = !!c && !!(c.label || c.action || c.color);
      g.classList.toggle("is-assigned", on);
      g.classList.toggle("dimmable", controlKind(g.id, d.settings, d.controls[g.id]?.kind) === "editable");
    });
  }, [profile, d.settings, d.controls]);
  useEffect(() => { const off = () => setHover(null); window.addEventListener("keydown", off); window.addEventListener("blur", off); return () => { window.removeEventListener("keydown", off); window.removeEventListener("blur", off); }; }, []);
  useEffect(() => { d.send({ type: "mirror", mode: active ? mirror : "off" }); }, [mirror, d.connected, active]); // eslint-disable-line  (the daemon stops sending the screen while the window is in the background)
  useEffect(() => { if (canvas.current) canvas.current.style.visibility = mirror === "off" ? "hidden" : "visible"; }, [mirror]);
  // stream mode: the daemon sends JPEG frames of the real display
  useEffect(() => {
    d.frameListener.current = async (buf) => {
      if (pausedRef.current || mirror !== "stream" || !canvas.current) return;
      const bmp = await createImageBitmap(new Blob([buf], { type: "image/jpeg" }));
      canvas.current.getContext("2d")?.drawImage(bmp, 0, 0, 1920, 320);
    };
  }, [mirror, d.frameListener]);
  // The screen on the picture belongs to the profile in the left column. When that isn't the live one, ask the daemon what it would show.
  const viewedId = profile?.id, live = viewedId === d.active.active;
  useEffect(() => {
    if (!viewedId || live || mirror !== "render") return;
    const t = window.setTimeout(() => d.send({ type: "preview_scene", id: viewedId }), 150);
    return () => clearTimeout(t);
  }, [viewedId, live, mirror, profile, d.settings, d.connected]); // eslint-disable-line
  const shown = arranging && ed.scene ? ed.scene : live || d.previewScene?.id !== viewedId ? d.scene : d.previewScene?.scene ?? d.scene;
  const shownRef = useRef(shown); shownRef.current = shown;
  const liveRef = useRef(live); liveRef.current = !(arranging && ed.scene) && (live || d.previewScene?.id !== viewedId);
  // render mode: draw the scene spec in the browser
  useEffect(() => {
    if (mirror !== "render") return;
    const id = window.setInterval(() => {
      const c = canvas.current; if (!c || pausedRef.current || !isActive()) return;
      const ctx = c.getContext("2d"); if (ctx) draw(ctx, d.icons, liveRef.current && d.sceneRef.current ? d.sceneRef.current : shownRef.current);
    }, 66);
    return () => clearInterval(id);
  }, [mirror, d.icons, d.scene]);

  const lastPulse = useRef(0);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const i = d.lastInput; if (!i) return;
    setPressed((s) => { const n = new Set(s); (i.kind === "press" || i.kind === "touch") ? n.add(i.control) : n.delete(i.control); return n; });
    if (listen && i.kind === "press") setSelected(i.control);
    if (i.kind === "press" || i.kind === "turn") {
      const now = Date.now(); if (i.kind === "turn" && now - lastPulse.current < 140) return; lastPulse.current = now;
      pulseAt(document.querySelector(`.replica #${CSS.escape(i.control)}`), profile?.controls[i.control]?.color ?? "#e8ecf4", i.kind === "turn" ? 0.35 : 0.8);
    }
  }, [d.lastInput]); // eslint-disable-line

  useEffect(() => { if (pop && selected !== pop.id) setPop(null); }, [selected]); // eslint-disable-line
  const clickControl = (id: string) => {
    if (editing) return;
    // Master, then a profile button: the same lock gesture as on the Push, done in the page
    if (id === "btn-master" || (d.active.armed && SCENE_IDS.includes(id))) { d.send({ type: "press", control: id }); if (id === "btn-master") setSelected(id); return; }
    setSelected(id);
    const el = document.querySelector(`.replica #${CSS.escape(id)}`);
    pulseAt(el, profile?.controls[id]?.color ?? "#e8ecf4", 0.6);
    if (el) setPop({ id, rect: el.getBoundingClientRect() });
  };
  const drop = (id: string, payload: string) => {
    try { const a = JSON.parse(payload); updateControl(id, { ...(profile?.controls[id] ?? {}), action: a }); setSelected(id); } catch { /* not an action */ }
  };
  const tip = hover ? describeControl(hover.id, { name: d.controls[hover.id]?.name ?? hover.id, settings: d.settings, profiles: d.profiles, pinned: d.active.pinned, profile }) : null;

  return (
    <section className="stage" aria-label="Push replica">
      <div className="stagetop"><div className="stagebar">
        <Tip align="left" title="Screen on the picture" desc="Preview draws the profile in the left column. Live copy mirrors your real Push screen, which may show a different profile. Hidden hides it.">
          <span className="screenctl"><span className="barlab">Screen</span><Seg label="Screen on the picture" value={mirror} onChange={setMirror} options={[{ value: "render", label: "Preview" }, { value: "stream", label: "Live copy" }, { value: "off", label: "Hidden" }]} /></span>
        </Tip>
        <button className="btn sm icon" onClick={() => setPaused(!paused)} disabled={mirror === "off"} aria-label={paused ? "Resume the screen" : "Freeze the screen"} title={paused ? "Resume the screen" : "Freeze the screen"}><Icon name={paused ? "play" : "pause"} size={14} /></button>
        <Tip align="left" title={editing ? "Finish editing" : "Edit layout"} desc="Drag knobs, pads and buttons onto each other to rearrange them. You confirm each move.">
          <button className={`btn sm ${editing ? "primary" : ""}`} aria-pressed={editing} onClick={() => { setEditing(!editing); setPop(null); setHover(null); }}><Icon name={editing ? "check" : "edit"} size={14} />{editing ? "Done editing" : "Edit layout"}</button>
        </Tip>
        <Tip align="left" title="Show assigned only" desc="Dims every pad and button that this profile doesn't use, so you can see what is set up.">
          <button className={`btn sm ${onlyAssigned ? "primary" : ""}`} aria-pressed={onlyAssigned} onClick={() => setOnlyAssigned(!onlyAssigned)}><Icon name="eye" size={14} />Assigned only</button>
        </Tip>
        <span className="spacer" />
        <Tip align="right" title="Sync with Push" desc="When on, pressing or turning something on your real Push selects it here too.">
          <span className="followbox">
            <Switch checked={listen} onChange={setListen} label={<span className="row" style={{ gap: 8 }}><Icon name="live" size={16} />Sync with Push</span>} />
            <span className="followhint">{listen ? (d.lastInput ? `Last: ${d.controls[d.lastInput.control]?.name ?? d.lastInput.control}` : "Waiting for the Push") : "Off"}</span>
          </span>
        </Tip>
      </div>
      <NoPush /></div>
      <div ref={col} className={`stagecol ${editing ? "editing" : ""} ${arranging ? "arranging" : ""} ${onlyAssigned ? "only-assigned" : ""}`}>
        <Replica profile={profile} selected={selected} pressed={pressed} status={d.status} standby={d.standby} masterLit={!!d.active.pinned && d.profiles.some((p) => p.id === d.active.pinned)}
          onSelect={clickControl} onDropAction={drop} onCanvas={(c) => { canvas.current = c; }} onOverlay={setOverlay}
          onHover={(id, x, y) => setHover(id ? { id, x, y } : null)} onWheel={nudgeKnob} />
        <Rings overlay={overlay} settings={d.settings} volume={d.volume} profile={profile} hoverId={hover?.id} />
        {editing && <EditMode />}
        {arranging && dbox && <div className="dover" style={dbox}><Grid ed={ed} /></div>}
      </div>
      {/* GitHub URL is a placeholder until the public repository exists */}
      <footer className="credits">Designed and developed by <b>Arcept</b><span aria-hidden="true">·</span><a href="https://github.com/arcept/pushdeck" target="_blank" rel="noreferrer">GitHub</a></footer>
      {pop && <QuickPop key={pop.id} id={pop.id} rect={pop.rect} onClose={() => setPop(null)} />}
      {tip && hover && !editing && (
        <div className="tip" role="tooltip" style={{ left: Math.min(hover.x + 14, window.innerWidth - 300), top: hover.y + 18 }}>
          <div className={`p ${tip.muted ? "muted" : ""}`}>{tip.primary}</div>
          {tip.secondary.map((s, i) => <div key={i} className="s">{s}</div>)}
        </div>)}
    </section>
  );
}

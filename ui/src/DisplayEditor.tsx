import { useEffect, useMemo, useRef, useState } from "react";
import type { Scene } from "./display/render";
import { useApp } from "./ctx";
import { COLS, DEFAULT_LAYOUT, PALETTE, ROWS, availableFor, clampTo, findSpot, fits, buttonsOf, reach, replaces, planMove, resizeTo, sizesOf, withWidget, type Proto, type W } from "./layoutModel";
import WidgetTile from "./WidgetTile";
import { Icon } from "./icons";
import { Switch } from "./ui";
import { iconSrc } from "./ProfileIcon";
import { playerSample, THEMES } from "./widgetSamples";

// One editing state for the grid laid over the picture of the Push's screen and the Widgets column beside it.
export function useLayoutEditor(on = true) {
  const { d, profile, updateProfile } = useApp();
  const [sel, setSel] = useState<number | null>(null);
  const sharedRaw = (d.settings as { display_widgets?: W[] } | null)?.display_widgets;
  const fallback: W[] = Array.isArray(sharedRaw) && sharedRaw.length ? sharedRaw : DEFAULT_LAYOUT;   // what a profile shows until it gets a layout of its own
  const own = profile?.display?.widgets as W[] | undefined;
  const hasOwn = Array.isArray(own);
  useEffect(() => { setSel(null); }, [profile?.id]);
  const list: W[] = hasOwn ? own! : fallback;
  const sharedSide = (d.settings as { player_side?: string } | null)?.player_side;
  const side: "left" | "right" = (profile?.display?.player_side ?? sharedSide) === "right" ? "right" : "left";   // the half the large player takes when the Layout button shows it
  const setSide = (v: "left" | "right") => { if (profile) updateProfile({ display: { ...profile.display, player_side: v } }); };

  // Always the layout of the profile selected on the left: the first change gives it a layout of its own.
  const commit = (next: W[]) => { if (profile) updateProfile({ display: { ...profile.display, widgets: next } }); };
  const reset = () => { if (profile) { const dd = { ...profile.display }; delete dd.widgets; updateProfile({ display: dd }); } setSel(null); };

  const listKey = JSON.stringify(list);
  useEffect(() => {
    if (!profile || !on) return;
    const t = window.setTimeout(() => d.send({ type: "preview_layout", id: profile.id, widgets: list }), 100);
    return () => clearTimeout(t);
  }, [profile?.id, listKey, d.connected, on]); // eslint-disable-line
  const raw: Scene | null = d.layoutPreview && d.layoutPreview.id === profile?.id ? d.layoutPreview.scene : null;
  const scene = useMemo<Scene | null>(() => {   // the player is painted here, with a made-up track, where the real one will be
    const p = list.find((x) => x.type === "player");
    if (!raw || !p) return raw;
    const o = playerSample(p.w >= 4 ? (p.col < 4 ? 0 : 4) : p.col, p.w);
    return { ...raw, spec: { ...raw.spec, widgets: [...raw.spec.widgets, o.widget], zones: { ...raw.spec.zones, ...o.zones } } };
  }, [raw, listKey]); // eslint-disable-line

  const add = (p: Proto) => { const x = findSpot(list.filter((o) => !(p.make().type === "player" && p.make().w >= 4 && o.type === "player")), p.make()); const next = x && withWidget(list, x); if (!next) return false; commit(next); setSel(next.length - 1); return true; };
  const patch = (i: number, p: Partial<W>) => commit(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const remove = (i: number) => { commit(list.filter((_, j) => j !== i)); setSel(null); };
  return { side, setSide, hasOwn, sel, setSel, list, commit, reset, scene, add, patch, remove, profile };
}
export type Editor = ReturnType<typeof useLayoutEditor>;


// ---- the grid laid over the picture of the screen ----
type Drag = { i: number | null; mode: "move" | "size"; x0: number; y0: number; start: W; cur: W; ok: boolean; out?: boolean } | null;
let draggedGrab = { fx: 0.5, fy: 0.5 };   // where on the tile it was picked up (0-1), so the widget lands under the pointer the way it was held
let draggedProto: Proto | null = null;   // the palette tile being dragged (dataTransfer can't be read while hovering)

export function Grid({ ed }: { ed: Editor }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [ghost, setGhost] = useState<{ w: W; ok: boolean } | null>(null);
  const cell = () => { const r = ref.current!.getBoundingClientRect(); return { cw: r.width / COLS, ch: r.height / ROWS, r }; };

  const begin = (e: React.PointerEvent, i: number, mode: "move" | "size") => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ed.setSel(i);
    setDrag({ i, mode, x0: e.clientX, y0: e.clientY, start: ed.list[i], cur: ed.list[i], ok: true });
  };
  const overColumn = (e: React.PointerEvent | null) => {
    const col = document.querySelector(".rightcol"), r = col?.getBoundingClientRect();
    const hit = !!(e && r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
    col?.classList.toggle("dropzone", hit);
    return hit;
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const { cw, ch } = cell();
    const dc = Math.round((e.clientX - drag.x0) / cw), dr = Math.round((e.clientY - drag.y0) / ch);
    const s = drag.start;
    if (drag.mode === "size") {   // snap to the nearest size this widget comes in
      const cur = clampTo(resizeTo(s, s.w + dc, s.h + dr));
      setDrag({ ...drag, cur, ok: fits(ed.list, cur, drag.i ?? -1) });
      return;
    }
    const cur: W = clampTo({ ...s, col: s.col + dc, row: s.row + dr });
    const out = overColumn(e);   // let go over the Widgets column and the widget goes back to it (removed)
    setDrag({ ...drag, cur, ok: out || !!planMove(ed.list, drag.i!, cur), out });
  };
  const end = () => {
    if (!drag) return;
    overColumn(null);
    if (drag.out) { ed.remove(drag.i!); setDrag(null); return; }
    const c = drag.cur, s = drag.start;
    if (drag.mode === "size") { if (drag.ok && (c.w !== s.w || c.h !== s.h || c.col !== s.col)) ed.commit(ed.list.map((x, j) => (j === drag.i ? c : x))); setDrag(null); return; }
    if (drag.ok && (c.col !== s.col || c.row !== s.row)) { const next = planMove(ed.list, drag.i!, c); if (next) ed.commit(next); }
    setDrag(null);
  };
  // dragging a tile in from the Widgets column: show where it would land
  const target = (e: React.DragEvent, p: Proto) => {
    const { cw, ch, r } = cell(), m = p.make(), bt = buttonsOf(m), strip = r.height * 0.3;
    const up = bt?.up.length ? strip : 0, frameH = m.h * ch + up + (bt?.down.length ? strip : 0);
    const left = e.clientX - draggedGrab.fx * m.w * cw, bodyTop = e.clientY - draggedGrab.fy * frameH + up;   // the widget's own top-left, from where it was held
    return clampTo({ ...m, col: Math.round((left - r.left) / cw), row: Math.round((bodyTop - r.top) / ch) });
  };
  const isBig = (p: Proto) => p.make().type === "player" && p.make().w >= 4;
  const onDragOver = (e: React.DragEvent) => {
    if (!draggedProto || false) return;
    e.preventDefault();
    const t = target(e, draggedProto);
    setGhost({ w: t, ok: !!withWidget(isBig(draggedProto) ? ed.list.filter((o) => o.type !== "player") : ed.list, t) });
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setGhost(null);
    const p = draggedProto; draggedProto = null; if (!p || false) return;
    const next = withWidget(ed.list, target(e, p));
    if (next) { ed.commit(next); ed.setSel(next.length - 1); }
    else ed.add(p);   // not at the spot you dropped it: the first free one
  };
  // a widget's frame includes the buttons it brings: 30 px (30 % of the 100 px body) above and / or below
  const box = (x: W) => { const r = reach(x), u = r.up ? 30 : 0, dn = r.down ? 30 : 0;
    return { left: `${(x.col / COLS) * 100}%`, top: `${(x.row / ROWS) * 100 - u}%`, width: `${(x.w / COLS) * 100}%`, height: `${(x.h / ROWS) * 100 + u + dn}%` }; };
  const note = (x: W) => { const l = replaces(x, (ed.profile?.controls ?? {}) as Record<string, { label?: string }>); return l.length ? `Replaces ${l.join(", ")}` : ""; };

  return (
    <div className="dgrid" ref={ref} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { overColumn(null); setDrag(null); }}
      onDragOver={onDragOver} onDragLeave={() => setGhost(null)} onDrop={onDrop} onPointerDown={() => ed.setSel(null)}>
      {Array.from({ length: COLS * ROWS }, (_, k) => { const c = k % COLS, r = Math.floor(k / COLS); return <span key={k} className="gc" style={{ left: `${(c / COLS) * 100}%`, top: `${(r / ROWS) * 100}%`, width: `${100 / COLS}%`, height: `${100 / ROWS}%` }} />; })}
      {ed.list.map((x, i) => {
        const cur = drag && drag.i === i ? drag.cur : x;
        return <div key={i} className={`gw ${ed.sel === i ? "sel" : ""} ${drag && drag.i === i ? (drag.out ? "gone" : drag.ok ? "drag" : "bad") : ""}`} style={box(cur)} onPointerDown={(e) => begin(e, i, "move")}>
          {drag && drag.i === i && !drag.out && note(cur) && <span className="gnote">{note(cur)}</span>}
          {sizesOf(x) > 1 && <span className="gh" onPointerDown={(e) => begin(e, i, "size")} title="Drag to resize" />}
        </div>;
      })}
      {ghost && <div className={`gw ghost ${ghost.ok ? "" : "bad"}`} style={box(ghost.w)}>{ghost.ok && note(ghost.w) && <span className="gnote">{note(ghost.w)}</span>}</div>}
    </div>
  );
}

// ---- the Widgets column (right side of the stage) ----

export function setDragged(p: Proto | null, grab = { fx: 0.5, fy: 0.5 }) { draggedProto = p; draggedGrab = grab; }

// One half-choice for the player: a small picture of the whole display with your widgets, and the player drawn over the half it would take.
function SideCard({ ed, side, title, sub }: { ed: Editor; side: "left" | "right"; title: string; sub: string }) {
  const c0 = side === "left" ? 0 : 4, box = (c: number, r: number, w: number, h: number) => ({ left: `${(c / COLS) * 100}%`, top: `${(r / ROWS) * 100}%`, width: `${(w / COLS) * 100}%`, height: `${(h / ROWS) * 100}%` });
  return (
    <button className={`wlay ${ed.side === side ? "on" : ""}`} aria-pressed={ed.side === side} onClick={() => ed.setSide(side)}>
      <span className="wmini" aria-hidden="true">
        {ed.list.map((x, k) => <i key={k} className={x.col < c0 + 4 && x.col + x.w > c0 ? "under" : ""} style={box(x.col, x.row, x.w, x.h)} />)}
        <i className="p" style={box(c0, 0, 4, 2)}><Icon name="music" size={10} /></i>
      </span>
      <b>{title}</b><small>{sub}</small>
    </button>);
}

const THEME_LIST: [string, string, string][] = [["neon", "Pixel Workers", "Flat pixel bar, pixel mascot"], ["plasma", "Plasma", "Plasma bar, round mascot"], ["classic", "Classic", "Segmented bar, original critter"]];
function LookPicker({ theme, set, on, setOn }: { theme: string; set: (v: string) => void; on: boolean; setOn: (v: boolean) => void }) {
  return (<div className="wlooks">
    <div className="wrow"><span>Choose a theme</span><div className="wpills" role="radiogroup" aria-label="Claude session theme">{THEME_LIST.map(([v, l, tip]) => <button key={v} role="radio" aria-checked={theme === v} title={tip} className={theme === v ? "on" : ""} onClick={() => set(v)}>{l}</button>)}</div></div>
    <div className="wrow" title="The pads ripple and a chime plays up to three times, 20 seconds apart. The display tells you to open Claude."><span>Notify when Claude asks questions</span><Switch checked={on} onChange={setOn} label={<span className="sr">Notify when Claude asks questions</span>} /></div>
  </div>);
}

function LimitPicker({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (<div className="wlooks">
    <div className="wrow" title="At 70, 80, 90 and 95 percent of the 5-hour or weekly limit the display turns red, the pads ripple red and a low chime plays. Any button dismisses it."><span>Notify when usage limits get close</span><Switch checked={on} onChange={set} label={<span className="sr">Notify when usage limits get close</span>} /></div>
  </div>);
}

export function WidgetsPanel({ ed }: { ed: Editor }) {
  const [full, setFull] = useState(false);
  const { d } = useApp();
  const name = ed.profile?.name ?? "this profile";
  const accent = ed.profile?.theme?.accent ?? "#d97757";
  const icon = ed.profile ? iconSrc(ed.profile) : "";
  const bundles = ed.profile?.match?.bundle_ids ?? [];
  useEffect(() => {   // Delete removes the selected widget
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if ((e.key === "Delete" || e.key === "Backspace") && ed.sel !== null && !t?.closest?.("input, textarea, select, [contenteditable]")) { e.preventDefault(); ed.remove(ed.sel); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [ed.sel, ed.list]); // eslint-disable-line
  const stored = String((d.settings as Record<string, unknown> | null)?.claude_theme ?? "neon"), theme = stored in THEMES ? stored : "neon", look = THEMES[theme];
  const setTheme = (value: string) => d.send({ type: "set_setting", key: "claude_theme", value });
  const st = (d.settings ?? {}) as Record<string, unknown>;
  const askOn = (st.ask_alert as { on?: boolean } | undefined)?.on !== false, limitOn = (st.limit_alert as { on?: boolean } | undefined)?.on !== false;
  const setLimit = (on: boolean) => d.send({ type: "set_setting", key: "limit_alert", value: { on } });
  const setAsk = (on: boolean) => d.send({ type: "set_setting", key: "ask_alert", value: { on } });
  const groups = PALETTE.reduce<Record<string, Proto[]>>((a, p) => ((a[p.group] ??= []).push(p), a), {});
  const click = (p: Proto) => {
    if (!ed.add(p)) { setFull(true); setTimeout(() => setFull(false), 1800); }
  };
  const ICON: Record<string, string> = { "Media player": "music", Profile: "user", Clock: "clock", "Claude usage": "activity", "Claude session": "terminal", "Codex usage": "bolt", "Browser tab": "globe", Browser: "globe", Downloads: "arrowdown" };
  const SecHead = ({ title, sub }: { title: string; sub: string }) => (
    <header className="wsechead"><div><h4>{title}</h4><p>{sub}</p></div></header>);
  return (<aside className="inspector widgetspanel" aria-label="Widgets">
    <header className="wtop"><span>For the</span><b>{name}</b><span>profile</span></header>
    <div className="wbody">
      <section className="wsec">
        <SecHead title="Media player" sub="The Layout button on the Push shows the large media player over one half, covering what is there. Press it again and your widgets are back." />
        <div className="wlays">
          <SideCard ed={ed} side="left" title="On the left" sub="Covers the left 4 columns" />
          <SideCard ed={ed} side="right" title="On the right" sub="Covers the right 4 columns" />
        </div>
      </section>
      <hr className="wrule" />
      <section className="wsec">
        <SecHead title="Widgets" sub="Drag one onto the screen. Drag it back here to remove it. Drop one on another to swap them." />
        {full && <p className="wwarn">No room for that. Make something smaller first.</p>}
        <div className="wgroups">
          {Object.entries(groups).filter(([, ps]) => availableFor(ps[0].make(), bundles)).map(([g, ps]) => (   // only the global widgets and the ones for this profile's apps
            <div key={g} className="wgroup"><h5><Icon name={(ICON[g] ?? "grid") as never} size={14} />{g}<span>{ps.length}</span></h5>
              {g === "Claude usage" && <LimitPicker on={limitOn} set={setLimit} />}
              {g === "Claude session" && <LookPicker theme={theme} set={setTheme} on={askOn} setOn={setAsk} />}
              <div className="wvars">{[...ps].sort((a, b) => { const x = a.make(), y = b.make(); return y.w * y.h - x.w * x.h; }).map((p) => <WidgetTile key={p.id} p={p} icons={d.icons} name={name} accent={accent} icon={icon} look={look} onAdd={() => click(p)} />)}</div>
            </div>))}
        </div>
      </section>
      {ed.hasOwn && <><hr className="wrule" /><button className="btn ghost wreset" onClick={ed.reset}><Icon name="reset" size={14} />Reset to the default layout</button></>}
    </div>
  </aside>);
}

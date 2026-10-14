import { useEffect, useRef } from "react";
import svgSource from "./assets/push2.svg?raw";
import shadowsUrl from "./assets/shadows.png";
import type { Profile, Status } from "./daemon";

type Props = {
  profile: Profile | undefined; selected: string | null; pressed: Set<string>; status: Status; standby: boolean; masterLit?: boolean;
  onSelect: (id: string) => void; onDropAction: (id: string, payload: string) => void;
  onCanvas: (c: HTMLCanvasElement | null) => void; onOverlay: (g: SVGGElement | null) => void;
  onHover: (id: string | null, x: number, y: number) => void; onWheel: (id: string, dir: number) => void;
};

// The SVG (assets/push2.svg) is inlined. Every control is <g id=...> with <id>-base and <id>-led.
// Its <title>/<desc> are stripped: browsers show those as a native tooltip, which would sit on top of ours.
const html = svgSource
  .replace(/<svg([^>]*?)\swidth="\d+"\s+height="\d+"/, '<svg$1 aria-label="Ableton Push 2"')
  .replace(/<title>[\s\S]*?<\/title>/g, "")
  .replace(/<desc>[\s\S]*?<\/desc>/g, "")
  // The soft shadows are a picture drawn once (tools/bake_shadows.py): live SVG filters on 141 shapes cost the web view over 100 MB of graphics memory.
  // The two cable shadows stay live because the cable moves.
  .replace(/<use [^>]*filter="url\(#(?:button|pad-inner|knob|body)-shadow\)"[^>]*\/>\s*/g, "")
  .replace('<g id="shadows" pointer-events="none">', `<g id="shadows" pointer-events="none"><image href="${shadowsUrl}" x="32.4" y="-11.9" width="1535.1" height="1439.2" preserveAspectRatio="none"/>`);

export default function Replica({ profile, selected, pressed, status, standby, masterLit, onSelect, onDropAction, onCanvas, onOverlay, onHover, onWheel }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const svg = () => host.current?.querySelector("svg") as SVGSVGElement | null;
  const idOf = (t: EventTarget | null) => ((t as Element | null)?.closest("g.control") as SVGGElement | null)?.id ?? null;

  // one-time: a canvas inside the display group (the mirror) and an overlay layer for the knob rings
  useEffect(() => {
    const root = svg(); const disp = root?.querySelector("#display");
    if (!root || !disp) return;
    // The screen is an HTML canvas laid over a placeholder rect in the SVG. (A canvas inside an SVG foreignObject is placed wrongly by WebKit, the engine of the app's native window.)
    const hostEl = host.current!;
    const slot = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    ["x", "y", "width", "height"].forEach((k, i) => slot.setAttribute(k, ["340", "415", "876", "146"][i])); slot.setAttribute("fill", "none"); slot.setAttribute("pointer-events", "none");
    disp.querySelector("#display-base")?.after(slot);
    const canvas = document.createElement("canvas");
    canvas.width = 1920; canvas.height = 320; canvas.style.cssText = "position:absolute;display:block;pointer-events:none;visibility:hidden";
    hostEl.appendChild(canvas);
    const place = () => {
      // Laid out from the SVG's own coordinates (getCTM ignores CSS transforms), so the picture's 3D tilt moves the screen with it instead of being measured twice.
      const ctm = slot.getCTM(); if (!ctm) return;   // user units -> the svg's own pixels (viewBox scale included)
      canvas.style.left = `${ctm.a * 340 + ctm.e}px`; canvas.style.top = `${ctm.d * 415 + ctm.f}px`;
      canvas.style.width = `${ctm.a * 876}px`; canvas.style.height = `${ctm.d * 146}px`;
    };
    place(); requestAnimationFrame(place); setTimeout(place, 150);
    const ro = new ResizeObserver(place); ro.observe(hostEl);
    window.addEventListener("resize", place);
    const ov = document.createElementNS("http://www.w3.org/2000/svg", "g"); ov.setAttribute("id", "overlay"); ov.setAttribute("pointer-events", "none");
    (root.querySelector("#device-space") ?? root).appendChild(ov); // same transform as the controls, so overlays line up
    // Lit pads keep the rubber's depth: a soft highlight top-left and shade bottom-right laid over the colour (shown only while the pad is lit)
    const ns = "http://www.w3.org/2000/svg", defs = root.querySelector("defs") ?? root.insertBefore(document.createElementNS(ns, "defs"), root.firstChild);
    const gr = document.createElementNS(ns, "radialGradient"); gr.setAttribute("id", "pad-lit-shade"); gr.setAttribute("cx", "0.27"); gr.setAttribute("cy", "0.18"); gr.setAttribute("r", "0.95");
    [["0", "#fff", ".2"], ["0.5", "#fff", "0"], ["1", "#000", ".3"]].forEach(([o, c, a]) => { const s = document.createElementNS(ns, "stop"); s.setAttribute("offset", o); s.setAttribute("stop-color", c); s.setAttribute("stop-opacity", a); gr.appendChild(s); });
    defs.appendChild(gr);
    const shades: SVGElement[] = [];
    root.querySelectorAll<SVGElement>("g.pad").forEach((g) => {
      const led = g.querySelector(".led"); if (!led) return;
      const r = document.createElementNS(ns, "rect"); ["x", "y", "width", "height", "rx"].forEach((a) => r.setAttribute(a, led.getAttribute(a) ?? "0"));
      r.setAttribute("fill", "url(#pad-lit-shade)"); r.setAttribute("class", "pad-shade"); r.setAttribute("opacity", "0"); r.setAttribute("pointer-events", "none");
      led.after(r); shades.push(r);
    });
    onCanvas(canvas); onOverlay(ov);
    return () => { ro.disconnect(); window.removeEventListener("resize", place); canvas.remove(); slot.remove(); ov.remove(); gr.remove(); shades.forEach((s) => s.remove()); onCanvas(null); onOverlay(null); };
  }, []); // eslint-disable-line

  // LEDs, selection, cables
  useEffect(() => {
    const root = svg(); if (!root) return;
    root.querySelectorAll<SVGElement>(".led").forEach((l) => l.setAttribute("fill-opacity", "0"));
    root.querySelectorAll<SVGElement>(".pad-shade").forEach((s) => s.setAttribute("opacity", "0"));
    root.querySelectorAll<SVGElement>(".pad .led").forEach((l) => { l.style.filter = ""; });
    root.querySelectorAll(".sel").forEach((e) => e.classList.remove("sel"));
    root.querySelectorAll<SVGElement>("#labels [data-orig]").forEach((el) => { el.setAttribute(el.tagName === "text" ? "fill" : "stroke", el.dataset.orig!); el.style.filter = ""; });
    if (selected) root.querySelector(`#${CSS.escape(selected)}`)?.classList.add("sel");
    const usb = root.querySelector<SVGElement>("#cable-usb");
    if (usb) { usb.style.opacity = status.usb ? "1" : "0.18"; usb.style.transform = status.usb ? "" : "translateY(-40px)"; }
    if (standby) return; // the real Push has every LED off in standby; so does the replica
    // Pads light their whole face. Buttons light only their printed legend (text and arrow), as on the real Push.
    const lightLegend = (id: string, col: string) => root.querySelectorAll<SVGElement>(`#labels [data-control="${CSS.escape(id)}"]`).forEach((el) => {
      const attr = el.tagName === "text" ? "fill" : "stroke";
      if (el.dataset.orig === undefined) el.dataset.orig = el.getAttribute(attr) ?? "";
      el.setAttribute(attr, col); el.style.filter = `drop-shadow(0 0 1.2px ${col})`;
    });
    const light = (id: string, col: string, o: number) => {
      if (root.querySelector(`#${CSS.escape(id)}`)?.classList.contains("pad")) {
        const led = root.querySelector<SVGElement>(`#${CSS.escape(id)}-led`);
        if (led) { led.setAttribute("fill", col); led.setAttribute("fill-opacity", String(Math.min(1, o + 0.12))); led.style.filter = `saturate(1.4) brightness(1.08) drop-shadow(0 0 ${o >= 1 ? 9 : 5}px ${col}aa)`; } // lit pads: strong colour with a soft glow
        root.querySelector(`#${CSS.escape(id)} .pad-shade`)?.setAttribute("opacity", String(o));
      } else lightLegend(id, col);
    };
    for (const [id, c] of Object.entries(profile?.controls ?? {})) if (c.color) light(id, c.color, 0.85);
    if (masterLit) light("btn-master", "#ffffff", 1); // Master stays lit while a profile is locked, as on the Push
    pressed.forEach((id) => light(id, profile?.controls[id]?.color ?? "#ffffff", 1));
  }, [profile, selected, pressed, status, standby, masterLit]);

  return (
    <div ref={host} className="replica" dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => { const id = idOf(e.target); if (id) onSelect(id); }}
      onMouseMove={(e) => onHover(idOf(e.target), e.clientX, e.clientY)}
      onMouseLeave={() => onHover(null, 0, 0)}
      onWheel={(e) => { const id = idOf(e.target); if (id?.startsWith("knob-")) onWheel(id, e.deltaY < 0 ? 1 : -1); }}
      onDragOver={(e) => { if (idOf(e.target)) e.preventDefault(); }}
      onDrop={(e) => { const id = idOf(e.target); if (id) { e.preventDefault(); onDropAction(id, e.dataTransfer.getData("text/plain")); } }} />
  );
}

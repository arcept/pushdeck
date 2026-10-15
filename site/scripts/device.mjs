// Builds public/img/push2-device.svg from assets/push2.svg (a copy of the app's replica art, ui/src/assets/push2.svg).
// The page shows it as a plain <img>, so the browser rasterises it once and the 3D tilt is a cheap compositor transform.
// The lit pads and the display are separate layers drawn on top (components/Device.tsx), so the SVG keeps every LED off.
// It also builds public/img/push2-lights.svg: only the backlit parts (the printed button legends), so the page can
// darken the body and still let these shine through, the way the real Push looks in a dim room.
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, "..");
const src = fs.readFileSync(path.join(root, "assets/push2.svg"), "utf8");
const shadows = fs.readFileSync(path.join(root, "assets/shadows.png")).toString("base64");

const out = src
  // trim the empty sides and bottom; keep the cables at the top in full (the page fades them out) — keep in sync with VIEW in components/Device.tsx
  .replace(/<svg([^>]*?)\swidth="\d+"\s+height="\d+"\s+viewBox="[^"]*"/, '<svg$1 viewBox="40 0 1520 1460"')
  .replace(/<title>[\s\S]*?<\/title>/g, "")
  .replace(/<desc>[\s\S]*?<\/desc>/g, "")
  // soft shadows as one baked picture instead of 141 live filters (same as the app's Replica.tsx)
  .replace(/<use [^>]*filter="url\(#(?:button|pad-inner|knob|body)-shadow\)"[^>]*\/>\s*/g, "")
  .replace('<g id="shadows" pointer-events="none">', `<g id="shadows" pointer-events="none"><image href="data:image/png;base64,${shadows}" x="32.4" y="-11.9" width="1535.1" height="1439.2" preserveAspectRatio="none"/>`)
  // the cables move in the app; here they are just art, so drop their live shadows too
  .replace(/<use [^>]*filter="url\(#cable-shadow\)"[^>]*\/>\s*/g, "")
  // a very fine matte grain over the whole device (under the printed labels), like the real soft-touch finish; drawn once
  .replace("</defs>", `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs>`)
  .replace('<g id="glass"', '<rect x="90" y="228" width="1420" height="1142" rx="3" filter="url(#grain)" opacity="0.07" style="mix-blend-mode:overlay" pointer-events="none"/>\n    <g id="glass"');

fs.mkdirSync(path.join(root, "public/img"), { recursive: true });
fs.writeFileSync(path.join(root, "public/img/push2-device.svg"), out);
console.log(`push2-device.svg: ${(out.length / 1024).toFixed(0)} KB`);

// ---- the lights layer ----
// Only the printed legends light (as on the Push: buttons never light their whole face; only the pads do).
// RGB buttons light their legend in colour, the rest in white. Colours follow the hero's Claude Code look.
const WHITE = "#f1f3f6";
const RGB = {   // RGB buttons: id -> legend colour
  "btn-1-32t": "#4f8cff", "btn-1-32": "#ff9a3c", "btn-1-16t": "#3cdc78",   // the three profile buttons (Browser, Claude Code, ChatGPT / Codex)
  "btn-play": "#3cdc78", "btn-record": "#ff5a5a", "btn-automate": "#ff5a5a",
  "btn-mute": "#ffc93c", "btn-solo": "#4f8cff", "btn-stop-clip": "#ff5a5a",
};
const legendColour = (id) => RGB[id] || WHITE;

const devSpace = src.match(/<g id="device-space"[^>]*>/)[0];
const legends = [...src.matchAll(/<(text|path|circle)([^>]*data-control="(btn-[a-z0-9-]+)"[^>]*?)(\/>|>([\s\S]*?)<\/text>)/g)].map((m) => {
  const col = legendColour(m[3]);
  const attrs = m[2].replace(/fill="#[0-9a-fA-F]+"/, `fill="${col}"`).replace(/stroke="#[0-9a-fA-F]+"/, `stroke="${col}"`);
  return m[1] === "text" ? `<text${attrs}>${m[5]}</text>` : `<${m[1]}${attrs}/>`;
});
// The two rows of RGB buttons above and below the display: the thin line inside each lights in colour (positions from the replica art).
const ROW = ["#ff9a3c", "#a06bff", "#2fc8b8", "#ff5fa8", "#4f8cff", "#ffc93c", "#3cdc78", "#ff5a5a"];
const strips = [...src.matchAll(/<g id="btn-(upper|lower)-(\d)"[^>]*transform="translate\(([\d.]+) ([\d.]+)\)"/g)].map((m) => {
  const col = ROW[(Number(m[2]) - 1 + (m[1] === "lower" ? 3 : 0)) % ROW.length];
  return `<rect x="${Number(m[3]) + 10}" y="${Number(m[4]) + 26}" width="76" height="3" fill="${col}"/>`;
});
const lights = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 0 1520 1460">
  <defs>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="strip-glow" x="-10%" y="-300%" width="120%" height="700%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  ${devSpace}
    <g font-family="Arial, Helvetica, sans-serif" filter="url(#glow)">
      ${legends.join("\n      ")}
    </g>
    <g filter="url(#strip-glow)">
      ${strips.join("\n      ")}
    </g>
  </g>
</svg>
`;
fs.writeFileSync(path.join(root, "public/img/push2-lights.svg"), lights);
console.log(`push2-lights.svg: ${legends.length} backlit legends, ${strips.length} button strips`);

// Builds public/img/push2-device.svg from assets/push2.svg (a copy of the app's replica art, ui/src/assets/push2.svg).
// The page shows it as a plain <img>, so the browser rasterises it once and the 3D tilt is a cheap compositor transform.
// The lit pads and the display are separate layers drawn on top (components/Device.tsx), so the SVG keeps every LED off.
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, "..");
const src = fs.readFileSync(path.join(root, "assets/push2.svg"), "utf8");
const shadows = fs.readFileSync(path.join(root, "assets/shadows.png")).toString("base64");

const out = src
  // crop to the device body (the canvas also holds the cables) — keep in sync with VIEW in components/Device.tsx
  .replace(/<svg([^>]*?)\swidth="\d+"\s+height="\d+"\s+viewBox="[^"]*"/, '<svg$1 viewBox="40 200 1520 1260"')
  .replace(/<title>[\s\S]*?<\/title>/g, "")
  .replace(/<desc>[\s\S]*?<\/desc>/g, "")
  // soft shadows as one baked picture instead of 141 live filters (same as the app's Replica.tsx)
  .replace(/<use [^>]*filter="url\(#(?:button|pad-inner|knob|body)-shadow\)"[^>]*\/>\s*/g, "")
  .replace('<g id="shadows" pointer-events="none">', `<g id="shadows" pointer-events="none"><image href="data:image/png;base64,${shadows}" x="32.4" y="-11.9" width="1535.1" height="1439.2" preserveAspectRatio="none"/>`)
  // the cables move in the app; here they are just art, so drop their live shadows too
  .replace(/<use [^>]*filter="url\(#cable-shadow\)"[^>]*\/>\s*/g, "");

fs.mkdirSync(path.join(root, "public/img"), { recursive: true });
fs.writeFileSync(path.join(root, "public/img/push2-device.svg"), out);
console.log(`push2-device.svg: ${(out.length / 1024).toFixed(0)} KB`);

import type { ReactNode } from "react";

// Custom drawings for the first-run setup and the tour. Small icons share one style (24 grid, round 1.7 strokes);
// the Push drawing is a simplified picture of the real device: knobs, the wide screen, the 8 x 8 pads.
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Svg = ({ size = 24, children }: { size?: number; children: ReactNode }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...S}>{children}</svg>;
type P = { size?: number };

export const IconPads = ({ size }: P) => <Svg size={size}>{[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <rect key={r * 3 + c} x={3.5 + c * 6} y={3.5 + r * 6} width="4" height="4" rx="1.2" />))}</Svg>;
export const IconScreen = ({ size }: P) => <Svg size={size}><rect x="2.5" y="7" width="19" height="9" rx="2" /><path d="M6 11.5h3M11 11.5h7" /><path d="M8 20h8" /></Svg>;
export const IconShield = ({ size }: P) => <Svg size={size}><path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></Svg>;
export const IconUsb = ({ size }: P) => <Svg size={size}><path d="M12 3v14" /><circle cx="12" cy="19" r="2" /><path d="M12 8l4-2.5M12 12l-4-2.5" /><rect x="14.8" y="3.2" width="3" height="3" rx=".6" /><circle cx="7" cy="9" r="1.4" /></Svg>;
export const IconKeys = ({ size }: P) => <Svg size={size}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17.5 10h.01M7 14h10" /></Svg>;
export const IconLink = ({ size }: P) => <Svg size={size}><rect x="2.5" y="3.5" width="8" height="8" rx="2" /><rect x="13.5" y="12.5" width="8" height="8" rx="2" /><path d="M10.5 7.5h3a2 2 0 012 2V12.5M13.5 16.5h-3a2 2 0 01-2-2V11.5" /></Svg>;
export const IconWave = ({ size }: P) => <Svg size={size}><path d="M4 10v4M8 6.5v11M12 3.5v17M16 7.5v9M20 10v4" /></Svg>;
export const IconGauge = ({ size }: P) => <Svg size={size}><path d="M4.5 17a8 8 0 1115 0" /><path d="M12 14l4-5" /><circle cx="12" cy="14.5" r="1.3" /></Svg>;
export const IconStack = ({ size }: P) => <Svg size={size}><rect x="3.5" y="9" width="17" height="11" rx="2.5" /><path d="M6.5 6h11M9 3h6" /></Svg>;
export const IconImport = ({ size }: P) => <Svg size={size}><path d="M12 3.5v11M8 11l4 4 4-4" /><path d="M4.5 15v3a2 2 0 002 2h11a2 2 0 002-2v-3" /></Svg>;
export const IconPlus = ({ size }: P) => <Svg size={size}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" /></Svg>;
export const IconLibrary = ({ size }: P) => <Svg size={size}><rect x="3.5" y="4" width="6" height="16" rx="1.6" /><rect x="11" y="4" width="4.5" height="16" rx="1.6" /><path d="M17.2 5.4l3 .9-3.6 13.3-3-.9z" /></Svg>;
export const IconTick = ({ size }: P) => <Svg size={size}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconRefresh = ({ size }: P) => <Svg size={size}><path d="M19.5 12a7.5 7.5 0 11-2.4-5.5M19.5 4v4h-4" /></Svg>;

/** A soft tile holding a big icon: the hero of a step that does not need the device drawing. */
export const Badge = ({ children, tone = "#aeb0ff" }: { children: ReactNode; tone?: string }) => (
  <div className="badge" style={{ ["--tone" as string]: tone }}><div className="badgein">{children}</div></div>
);

/** The Push 2, simplified: knob row, the wide screen and the pad grid with a few lit pads. `usb` draws the cable (a connected device). */
export function PushDrawing({ usb = false }: { usb?: boolean }) {
  const lit: Record<number, string> = { 9: "#4f8cff", 11: "#ff9a3c", 18: "#a06bff", 21: "#2fc8b8", 27: "#ff5fa8", 36: "#3cdc78", 38: "#ffc93c", 45: "#ff5a5a", 52: "#4f8cff", 54: "#a06bff" };
  return (
    <svg className="pushdraw" viewBox="0 0 260 162" width="260" height="162" aria-hidden="true">
      <rect x="6" y="6" width="248" height="138" rx="12" fill="#14141b" stroke="rgba(255,255,255,.14)" />
      {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={30 + i * 28.5} cy="22" r="6" fill="#23232d" stroke="rgba(255,255,255,.18)" />)}
      <rect x="22" y="36" width="216" height="22" rx="4" fill="#050508" stroke="rgba(255,255,255,.12)" />
      <path className="scr" d="M30 47h38M78 47h24M112 47h46M168 47h26M204 47h26" stroke="#aeb0ff" strokeWidth="3" strokeLinecap="round" opacity=".7" />
      {Array.from({ length: 64 }, (_, i) => { const r = Math.floor(i / 8), c = i % 8; const col = lit[i];
        return <rect key={i} className={col ? "padlit" : undefined} style={col ? { ["--c" as string]: col, animationDelay: `${(i % 7) * 260}ms` } : undefined} x={30 + c * 25.8} y={66 + r * 9.4} width="21" height="7" rx="2" fill={col ?? "#23232d"} />; })}
      {usb && <g><path d="M130 144v8" stroke="#6b6b77" strokeWidth="3" strokeLinecap="round" /><rect x="123" y="150" width="14" height="6" rx="1.5" fill="#6b6b77" /></g>}
    </svg>
  );
}

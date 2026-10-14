// One drawn icon family: 24px grid, 1.75 stroke, round caps. Add icons here; never use text glyphs as icons.
export const ICON_PATHS: Record<string, string> = {
  gear: "M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  power: "M12 3v8M6.3 7.2a8 8 0 1 0 11.4 0",
  sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  search: "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM20 20l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM16 9V6a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2",
  trash: "M5 7h14M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  upload: "M12 16V5M7 9l5-5 5 5M5 20h14",
  live: "M12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.4 9.4 0 0 0 0 13.2M18.6 5.4a9.4 9.4 0 0 1 0 13.2",
  play: "M8 5.5l10 6.5-10 6.5z",
  pause: "M8 5v14M16 5v14",
  skipnext: "M6 5.5l9 6.5-9 6.5zM18 5v14",
  skipprev: "M18 5.5L9 12l9 6.5zM6 5v14",
  heart: "M12 20s-7-4.4-8.5-9A4.5 4.5 0 0 1 12 7.3 4.5 4.5 0 0 1 20.5 11C19 15.6 12 20 12 20z",
  shuffle: "M3 7h4l9 10h5M3 17h4l3-3.4M14 9.4L16 7h5M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5",
  repeat: "M4 11V9a2 2 0 0 1 2-2h13M16 4l3 3-3 3M20 13v2a2 2 0 0 1-2 2H5M8 20l-3-3 3-3",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  down: "M6 9l6 6 6-6",
  right: "M9 6l6 6-6 6",
  keyboard: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  text: "M5 6h14M12 6v13M9 19h6",
  app: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  terminal: "M4 6l6 6-6 6M12 18h8",
  bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5",
  volume: "M4 10v4h4l5 4V6L8 10H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  flask: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01",
  alert: "M12 4l9.5 16h-19zM12 10v4M12 17h.01",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  command: "M9 9h6v6H9zM9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zM15 9h2.5A2.5 2.5 0 1 0 15 6.5V9zM9 15H6.5A2.5 2.5 0 1 0 9 17.5V15zM15 15v2.5a2.5 2.5 0 1 0 2.5-2.5H15z",
  knob: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 12V7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4.5 20a7.5 7.5 0 0 1 15 0",
  music: "M9 18V6l10-2v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  stack: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  reset: "M4 12a8 8 0 1 1 3 6.2M4 19v-5h5",
  pin: "M9 4h6l-1 5 3 3H7l3-3zM12 12v8",
  pad: "M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z",
  file: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5",
  media: "M5 5l8 7-8 7zM15 5v14M19 5v14",
  record: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
};

export type IconName = keyof typeof ICON_PATHS;
export const ICON_NAMES = Object.keys(ICON_PATHS);

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`ico ${className ?? ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[name] ?? ICON_PATHS.info} /></svg>
  );
}

// The display's own icon set (daemon/push_daemon/icons.json), drawn in the browser for the icon picker.
export function DisplayIcon({ shapes, size = 22 }: { shapes: { p?: number[][]; c?: number[]; closed?: boolean; fill?: boolean }[]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1 1" fill="none" stroke="currentColor" strokeWidth="0.09" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes.map((s, i) => s.c
        ? <circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} />
        : <path key={i} d={s.p!.map(([x, y], j) => `${j ? "L" : "M"}${x} ${y}`).join("") + (s.closed ? "Z" : "")} fill={s.fill ? "currentColor" : "none"} />)}
    </svg>
  );
}

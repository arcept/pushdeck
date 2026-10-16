import type { Action, Ctl, Profile, Settings } from "./daemon";
import type { IconName } from "./icons";

export const MODS: Record<string, string> = { cmd: "⌘", command: "⌘", shift: "⇧", alt: "⌥", opt: "⌥", option: "⌥", ctrl: "⌃", control: "⌃" };
export const formatKeys = (k: string) => k.split("+").map((p) => MODS[p.trim().toLowerCase()] ?? (["fn", "globe"].includes(p.trim().toLowerCase()) ? "Fn" : p.trim().length === 1 ? p.trim().toUpperCase() : p.trim())).join("");

export type ActionKind = { type: string; label: string; fieldLabel: string; icon: IconName; field: string; placeholder: string; hint: string };
export const ACTION_KINDS: ActionKind[] = [
  { type: "keys", fieldLabel: "Keys", label: "Shortcut", icon: "keyboard", field: "keys", placeholder: "cmd+shift+r", hint: "Press Record, then the keys." },
  { type: "text", fieldLabel: "Text to type", label: "Type text", icon: "text", field: "text", placeholder: "Text to type", hint: "Typed into the frontmost app." },
  { type: "app", fieldLabel: "App name", label: "Open app", icon: "app", field: "name", placeholder: "Figma", hint: "The app's name." },
  { type: "url", fieldLabel: "Address", label: "Open URL", icon: "globe", field: "url", placeholder: "https://", hint: "Opens in your default browser." },
  { type: "shell", fieldLabel: "Command", label: "Shell", icon: "terminal", field: "command", placeholder: "open ~/Downloads", hint: "Runs in a shell. Mark it risky." },
  { type: "shortcut", fieldLabel: "Shortcut name", label: "Shortcuts.app", icon: "bolt", field: "name", placeholder: "Shortcut name", hint: "Runs a macOS Shortcut." },
  { type: "pin", fieldLabel: "Note", label: "Pin profile (Master)", icon: "bolt", field: "note", placeholder: "Optional", hint: "Makes this profile Master so it stays on screen whatever app is in front. Press again to follow your apps." },
  { type: "media", fieldLabel: "Action", label: "Media", icon: "media", field: "name", placeholder: "play_pause", hint: "Play/pause, next, previous, volume, mute." },
  { type: "window", fieldLabel: "Layout", label: "Window", icon: "grid", field: "op", placeholder: "left-half", hint: "Moves and sizes the front app's window, or enters / leaves full screen. Press the same pad again to step through half, two-thirds and one-third. A full-screen window leaves full screen first (and goes back to it after a display move). Needs Accessibility." },
];
export const MEDIA_ACTIONS = [["play_pause", "Play / pause"], ["next", "Next track"], ["prev", "Previous track"], ["volume_up", "Volume up"], ["volume_down", "Volume down"], ["mute", "Mute"]];
// Window layouts, in the order of the default pad block (names match daemon/push_daemon/windows.py OPS).
export const WINDOW_ACTIONS = [["top-left", "Top left"], ["top-half", "Top half"], ["top-right", "Top right"], ["maximize", "Maximize"], ["left-half", "Left half"], ["center", "Center"], ["right-half", "Right half"], ["full-screen", "Full screen"],
  ["bottom-left", "Bottom left"], ["bottom-half", "Bottom half"], ["bottom-right", "Bottom right"], ["next-display", "Next display"], ["first-third", "First third"], ["center-third", "Center third"], ["last-third", "Last third"], ["previous-display", "Previous display"], ["restore", "Restore"]];
/** What a freshly chosen action type starts with in its main field (a list kind starts on its first sensible choice). */
export const actionDefault = (k: ActionKind) => (k.type === "media" ? "play_pause" : k.type === "window" ? "left-half" : "");

export const actionKind = (t?: string) => ACTION_KINDS.find((k) => k.type === t);
export const summarize = (a?: Action): string => {
  if (!a) return "";
  const v = (k: string) => String(a[k] ?? "");
  switch (a.type) {
    case "keys": return a.hold ? `Holds ${formatKeys(v("keys"))} while pressed` : `Shortcut ${formatKeys(v("keys"))}`;
    case "text": return `Types “${v("text").replace(/\n/g, "↵")}”`;
    case "app": return `Opens ${v("name")}`;
    case "url": return `Opens ${v("url")}`;
    case "shell": return `Runs ${v("command")}`;
    case "shortcut": return `Runs Shortcut “${v("name")}”`;
    case "pin": return "Pins this profile (Master) · press again to follow your apps";
    case "media": return MEDIA_ACTIONS.find((m) => m[0] === v("name"))?.[1] ?? v("name");
    case "window": return `Window: ${WINDOW_ACTIONS.find((w) => w[0] === v("op"))?.[1] ?? v("op")}`;
    default: return a.type;
  }
};

export const GLOBAL_FN: Record<string, { title: string; short: string; icon: IconName }> = {
  brightness: { title: "Brightness (display and pads)", short: "Bright", icon: "sun" },
  display: { title: "Display brightness", short: "Display", icon: "sun" },
  leds: { title: "Pad & button brightness", short: "Pads", icon: "grid" },
  volume: { title: "System volume", short: "Volume", icon: "volume" },
};
export const KNOB_ROWS: [string, string][] = [["knob-tempo", "Tempo"], ["knob-swing", "Swing"], ...[1, 2, 3, 4, 5, 6, 7, 8].map((n): [string, string] => [`knob-${n}`, `Encoder ${n}`]), ["knob-master", "Master"]];
export const RESERVED_KNOBS = ["knob-tempo", "knob-swing", "knob-master"];
// The 8 buttons right of the pads select a profile. Each is printed with a note value; button 1 is the top one.
export const SCENE_LEGEND = ["1/32t", "1/32", "1/16t", "1/16", "1/8t", "1/8", "1/4t", "1/4"];
export const sceneName = (i: number) => (i < 8 ? `Scene button ${i + 1} (${SCENE_LEGEND[i]})` : `Shift + scene button ${i - 7} (${SCENE_LEGEND[i - 8]})`);   // 0-7 on the device, 8-15 with Shift held
// A profile sits on exactly the scene button its slot names (0-15); the daemon keeps slots unique and fills gaps with new profiles.
export const sceneOrder = (ps: Profile[]) => [...ps].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99) || a.id.localeCompare(b.id));
export const sceneIndex = (ps: Profile[], id: string) => { const s = ps.find((p) => p.id === id)?.slot; return typeof s === "number" && s >= 0 && s < 16 ? s : -1; };
export const profileAt = (ps: Profile[], slot: number) => ps.find((p) => p.slot === slot);
// The right-hand column of pads and the top-left 4 x 4 window pads are one shared set that works in every profile (registry.py GLOBAL_PADS).
export const isGlobalPad = (id: string) => /^pad-\d-7$/.test(id) || /^pad-[0-3]-[0-3]$/.test(id);
export const SCENE_IDS = ["btn-1-32t", "btn-1-32", "btn-1-16t", "btn-1-16", "btn-1-8t", "btn-1-8", "btn-1-4t", "btn-1-4"];

export const COLOUR_NAMES: Record<string, string> = {
  "#d97757": "Clay", "#a259ff": "Violet", "#0acf83": "Green", "#1abcfe": "Sky blue", "#f24e1e": "Red orange",
  "#ffcd29": "Yellow", "#ff6bb5": "Pink", "#6ee7e7": "Aqua", "#ffffff": "White", "#8b8b99": "Grey",
};
export const colourName = (hex: string, profileAccent?: string) => COLOUR_NAMES[hex.toLowerCase()] ?? (hex === profileAccent ? "Profile colour" : "Custom colour");
export const PALETTE = ["#d97757", "#a259ff", "#0acf83", "#1abcfe", "#f24e1e", "#ffcd29", "#ff6bb5", "#6ee7e7", "#ffffff", "#8b8b99"];

export type Tip = { primary: string; secondary: string[]; muted?: boolean };

// Hover text: the function first (what it does), the mechanics (which control, scope) small underneath.
export function describeControl(id: string, o: {
  name: string; settings: Settings | null; profiles: Profile[]; pinned: string | null; profile?: Profile;
}): Tip {
  const gk = o.settings?.global_knobs?.[id];
  if (gk) return { primary: GLOBAL_FN[gk]?.title ?? gk, secondary: [`${o.name} · works in every profile`] };
  if (RESERVED_KNOBS.includes(id)) return { primary: "Not used", secondary: [`${o.name} · reserved`], muted: true };
  if (id === "btn-master") return { primary: "Master profile", secondary: ["Master · press it, then a profile button"] };
  if (id === "btn-repeat") return { primary: "Rerun the last test", secondary: ["Repeat · works in every profile"] };
  if (id === "btn-setup") return { primary: "Colour calibration", secondary: ["Setup · hold Shift and press"] };
  const si = SCENE_IDS.indexOf(id);
  if (si >= 0) {
    const p = sceneOrder(o.profiles)[si];
    return p ? { primary: `Switch to ${p.name}`, secondary: [`${sceneName(si)} · ${o.pinned === p.id ? "master, press to go back to Auto" : "press to make it master"}`] }
             : { primary: "Profile button, empty", secondary: [`${sceneName(si)} · no profile assigned`], muted: true };
  }
  const glob = isGlobalPad(id) ? " · global, works in every profile" : "";
  const c: Ctl | undefined = o.profile?.controls[id];
  if (!c || (!c.label && !c.action && !c.icon && !c.color)) return { primary: "Unassigned", secondary: [`${o.name}${glob} · click to assign`], muted: true };
  const act = summarize(c.action);
  return { primary: c.label ? (c.keep_case ? c.label : c.label.toUpperCase()) : act || "Colour only", secondary: [[c.label ? act : "", c.risky ? "needs a second press" : ""].filter(Boolean).join(" · "), o.name + glob].filter(Boolean) };
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
export const uniqueId = (base: string, taken: string[]) => { let id = slugify(base), n = 2; while (taken.includes(id)) id = `${slugify(base)}-${n++}`; return id; };

export type Kind = "global" | "reserved" | "repeat" | "setup" | "scene" | "unassignable" | "editable";
export function controlKind(id: string, settings: Settings | null, kind?: string): Kind {
  if (settings?.global_knobs?.[id]) return "global";
  if (RESERVED_KNOBS.includes(id)) return "reserved";
  if (id === "btn-master") return "repeat";
  if (id === "btn-repeat") return "repeat";
  if (id === "btn-setup") return "setup";
  if (SCENE_IDS.includes(id)) return "scene";
  if (kind === "knob" || kind === "strip") return "unassignable";
  return "editable";
}

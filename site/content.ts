// All the words and links on the page, in one place. Keep this consistent with README.md.

/** True once the .dmg is published on GitHub Releases (Push Deck 1.0.0 is out). */
export const RELEASE_LIVE = true;

export const REPO = "https://github.com/arcept/pushdeck";
export const RELEASES = `${REPO}/releases/latest`;
/** The .dmg itself (a GitHub Releases asset), so the buttons start the download instead of opening the release page. */
export const dmgUrl = (version: string) => `${REPO}/releases/download/v${version}/PushDeck-${version}-arm64.dmg`;
export const ISSUES = `${REPO}/issues`;

export const PAD_COLORS = ["#4f8cff", "#ff9a3c", "#a06bff", "#2fc8b8", "#ff5fa8", "#3cdc78", "#ffc93c", "#ff5a5a"];

export const features = [
  { title: "Profiles that follow your app", text: "Every app gets its own pads, buttons and knobs. Switch apps and the Push switches with you." },
  { title: "A live display", text: "The 960×160 screen shows clocks, timers, usage meters, the tab in front and a media player." },
  { title: "A replica to edit on", text: "A copy of your Push in a window: click a pad to set it up, mirror the display, arrange widgets." },
  { title: "Window shortcuts", text: "Sixteen built-in pads snap and resize the front window in any profile: halves, quarters, thirds, maximize, centre, full screen, next or previous display." },
  { title: "A menu bar app", text: "Pin a profile, set the brightness or turn the Push on and off without opening anything." },
  { title: "Private by design", text: "Runs on your Mac. No account, no cloud, no tracking. It listens on 127.0.0.1 only." },
];

// The guided tour inside the app window (Landing.tsx zooms the window to each of these in turn). Geometry lives with the code; the words live here.
export const tour = [
  { key: "select", tag: "The replica", accent: "#a06bff", title: "Click a pad. Say what it does.", text: "Pick any control on the replica and a little card pops up: a name, a colour, an action. That's the whole setup.", img: "tour/select.webp", alt: "A pad selected on the replica, with its name, action and colour card open" },
  { key: "drag", tag: "Drag and drop", accent: "#4f8cff", title: "Grab an action. Drop it on a pad.", text: "Shortcuts, links, apps, text, shell commands. Drag one onto the replica and the real Push has it right away.", img: "tour/drag-done.webp", alt: "A pad on the replica that has just been given a blue Docs action" },
  { key: "profiles", tag: "Profiles", accent: "#ff9a3c", title: "Every app gets its own pads.", text: "Auto switches profile as you change apps. Master pins one in place, whatever is in front.", img: "tour/prof-claude.webp", alt: "The profile header: Claude Code, active on your Push, with the Auto and Master switch" },
  { key: "display", tag: "Live display", accent: "#2fc8b8", title: "A screen that shows what matters.", text: "Clock, timers, usage meters, the tab in front. Arrange the widgets on the replica and they appear on the real display.", img: "display.gif", alt: "The Push display showing a clock, timers and usage meters" },
  { key: "setup", tag: "Set up", accent: "#3cdc78", title: "Ready in minutes.", text: "Say hello, allow two permissions, and you're playing. No account, no sign-up.", img: "tour/onb-welcome.webp", alt: "The first-run setup: Welcome to Push Deck" },
];

export const steps = [
  { name: "Claude Code", text: "A live session on the display, with its mascot and usage meters. Pads send the keys you use every day.", colors: [0, 2, 4, 1], video: "/video/claude.mp4", glow: "#ff9a3c" },
  { name: "Browser", text: "The tab in front on your display. Pads open sites, switch tabs and run page shortcuts.", colors: [0, 3, 5, 6], video: "/video/browser.mp4", glow: "#4f8cff" },
  { name: "ChatGPT / Codex", text: "Usage at a glance and the shortcuts you reach for, the moment the app comes to the front.", colors: [3, 5, 6, 7], video: "/video/codex.mp4", glow: "#2fc8b8" },
];

export const install = [
  { id: "dmg", label: "Download", cmd: "", note: "Downloads the .dmg (from GitHub Releases). Drag Push Deck to Applications.*" },
  { id: "brew", label: "Homebrew", cmd: "brew install --cask arcept/tap/pushdeck", note: "Installs the same app as the .dmg, from the arcept tap." },
  { id: "curl", label: "One line", cmd: "curl -fsSL https://raw.githubusercontent.com/arcept/pushdeck/main/get.sh | bash", note: "Checks the checksum. No security prompt." },
];

/** Quick answers. Keep every line true to the app and the README. */
export const faq = [
  { q: "Do I need Ableton Live?", a: "No. Push Deck talks to the Push 2 directly over USB, so you can use the Push without owning, installing or opening Live. The pads, buttons, knobs and the display are all driven by Push Deck. It is not a Live plug-in and doesn't need Live in any way." },
  { q: "Does it work with Push 3 or the original Push?", a: "Not yet. Push Deck is built for the Push 2: its USB protocol, its pad grid and its 960×160 display. The original Push and the Push 3 are different hardware, so they are not supported today. The Push 2 hardware notes are in the repository (docs/PUSH2_NOTES.md) if you are curious how it works." },
  { q: "Which computers does it run on?", a: "Macs with Apple Silicon, on macOS 13 or newer. The app carries its own Python and helpers, so there is nothing else to install. The music visualizer needs macOS 14.2. There is no Windows or Linux version." },
  { q: "Does it send anything anywhere?", a: "No account, no cloud, no tracking, and no Push Deck server to send anything to. The app listens on 127.0.0.1 only, so other devices on your network can't reach it. One optional feature touches a login: live Claude usage reads the Claude desktop app's sign-in from the macOS Keychain, in memory only. It asks first and can be switched off at any time. The privacy section above lists everything it touches." },
  { q: "Why does my Mac say “unidentified developer”?", a: "Push Deck is signed ad hoc rather than with a paid Apple Developer ID, so macOS shows an “unidentified developer” warning the first time you open a downloaded copy. Right-click the app, choose Open, then Open, and you won't be asked again. The one-line installer checks the download's checksum and avoids the warning." },
  { q: "Can it move and resize my windows?", a: "Yes. A built-in layer of 16 pads (the top-left 4×4 block) snaps and resizes the front window in every profile: halves, quarters, thirds, maximize, centre, full screen, and next or previous display. Switch it on or off globally in Settings, or per profile (Default, On or Off). You can rename and recolour those pads, and put Close window, Minimize window or Full screen on any pad. It needs the Accessibility permission. The layouts are modelled on Rectangle." },
  { q: "Can I make my own profiles?", a: "Yes. A profile is an app (or a few apps) with its own pad colours, labels and actions: shortcuts, opening apps and links, typing text, running Shortcuts or shell commands, media keys. Drag actions onto the replica in the app window to set them up; any pad can also close, minimize or full-screen the front window. In Auto mode the Push switches to a profile when its app comes to the front; Master keeps one pinned. It starts with profiles for Claude Code, Browser and ChatGPT / Codex." },
  { q: "Is it free? Can I contribute?", a: "It is free and open source under the MIT licence, © Arcept. The code is on GitHub and Issues are open for bugs and ideas. Pull requests are by invitation for now. Push Deck is an independent project and isn't affiliated with Ableton." },
];

export const requirements = [
  "Apple Silicon Mac, macOS 13 or newer",
  "An Ableton Push 2 on USB (not the original Push, not Push 3)",
  "The music visualizer needs macOS 14.2",
  "Accessibility permission, for key shortcuts and the window pads",
  "Chrome, Spotify and the Claude desktop app are optional",
];

export const copy = {
  kicker: "64 pads. Zero Ableton Live. Plenty of fun.",
  sub: "Plug in a Push 2 and it becomes a colourful controller for whatever you are doing, with a screen that shows what matters.",
  featuresTitle: "Pads that actually do things.",
  displayTitle: "Switch app. The display switches with you.",
  privacyTitle: "No account. No cloud. No peeking.",
  installTitle: "Grab it. Plug in. Press a pad.",
};

// The privacy card: what lives where. Keep every line true to the app (see the permissions page and the README).
export const privacyRows = [
  { icon: "folder", title: "Your profiles and settings", text: "Saved in the Application Support folder on your Mac. Nothing is uploaded." },
  { icon: "laptop", title: "The local server", text: "Answers on 127.0.0.1 only, so other devices on your network can't reach it." },
  { icon: "ban", title: "Accounts and analytics", text: "None. There is nothing to sign up for and nothing to opt out of." },
  { icon: "key", title: "Live Claude usage*", text: "Optional. It asks first, reads the sign-in in memory only, and switches off any time." },
  { icon: "wave", title: "The music visualizer", text: "Audio is analysed on your Mac and never recorded or sent anywhere." },
  { icon: "shield", title: "The Downloads folder", text: "Only looked at for unfinished download files, to show progress on the display." },
] as const;

export const claudeNote =
  "One optional feature touches a login: live Claude usage reads the Claude desktop app's sign-in from the macOS Keychain, in memory only. It asks first and can be switched off at any time.";

export const disclaimer =
  "Independent project, not affiliated with, endorsed by, or sponsored by Ableton AG. “Ableton” and “Push” are trademarks of Ableton AG.";

export const installNote =
  "Push Deck is signed ad hoc (no paid Apple Developer ID). A downloaded copy says “unidentified developer” once: right-click the app, choose Open, then Open. The one-line installer avoids this.";

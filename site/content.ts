// All the words and links on the page, in one place. Keep this consistent with README.md.

/** Flip to true when the first release is published and the .dmg exists. */
export const RELEASE_LIVE = false;

export const REPO = "https://github.com/arcept/pushdeck";
export const RELEASES = `${REPO}/releases/latest`;
export const ISSUES = `${REPO}/issues`;

export const PAD_COLORS = ["#4f8cff", "#ff9a3c", "#a06bff", "#2fc8b8", "#ff5fa8", "#3cdc78", "#ffc93c", "#ff5a5a"];

export const features = [
  { title: "Profiles that follow your app", text: "Pads, buttons and encoders run shortcuts, open apps and addresses, type text, or run Shortcuts and shell commands. The profile follows the app in front, or you pin one." },
  { title: "A live display", text: "The 960×160 screen shows button labels, a grid of widgets (clock, timers, Claude and Codex usage, the browser's tab) and a media player with a visualizer." },
  { title: "A replica to edit on", text: "A browser-style UI with a copy of your Push: click a pad to edit it, mirror the display, arrange widgets." },
  { title: "A menu bar app", text: "Pin a profile, open the window, set brightness and turn the Push on or off, without opening anything." },
  { title: "Set up in minutes", text: "First-run setup checks your Push, explains each macOS permission in plain words and offers a short tour." },
  { title: "Private by design", text: "Runs on your Mac. No account, no cloud, no tracking. It listens on 127.0.0.1 only." },
];

export const steps = [
  { name: "Claude Code", text: "A live session on the display, with its mascot and usage meters. Pads send the keys you use every day.", colors: [0, 2, 4, 1] },
  { name: "Browser", text: "The tab in front on your display. Pads open sites, switch tabs and run page shortcuts.", colors: [0, 3, 5, 6] },
  { name: "ChatGPT / Codex", text: "Usage at a glance and the shortcuts you reach for, the moment the app comes to the front.", colors: [3, 5, 6, 7] },
];

export const install = [
  { id: "dmg", label: "Download", cmd: "", note: "The .dmg from GitHub Releases. Drag Push Deck to Applications." },
  { id: "brew", label: "Homebrew", cmd: "brew install --cask arcept/tap/pushdeck", note: "Tap coming with the first release." },
  { id: "curl", label: "One line", cmd: "curl -fsSL https://raw.githubusercontent.com/arcept/pushdeck/main/get.sh | bash", note: "Checks the checksum. No security prompt." },
  { id: "src", label: "From source", cmd: "./install.sh", note: "Works today. Clone the repo first." },
];

export const requirements = [
  "Apple Silicon Mac, macOS 13 or newer",
  "An Ableton Push 2 on USB (not the original Push, not Push 3)",
  "The music visualizer needs macOS 14.2",
  "Chrome, Spotify and the Claude desktop app are optional",
];

export const copy = {
  kicker: "64 pads. Zero Ableton Live. Plenty of fun.",
  sub: "Plug in a Push 2 and it becomes a colourful controller for whatever you are doing, with a screen that shows what matters.",
  featuresTitle: "Pads that actually do things.",
  displayTitle: "Switch app. The pads switch with you.",
  privacyTitle: "No account. No cloud. No peeking.",
  installTitle: "Grab it. Plug in. Press a pad.",
};

export const claudeNote =
  "One optional feature touches a login: live Claude usage reads the Claude desktop app's sign-in from the macOS Keychain, in memory only. It asks first and can be switched off at any time.";

export const disclaimer =
  "Independent project, not affiliated with, endorsed by, or sponsored by Ableton AG. “Ableton” and “Push” are trademarks of Ableton AG.";

export const installNote =
  "Push Deck is signed ad hoc (no paid Apple Developer ID). A downloaded copy says “unidentified developer” once: right-click the app, choose Open, then Open. The one-line installer avoids this.";

import { createContext, useContext } from "react";
import type { Ctl, Profile, useDaemon } from "./daemon";
import type { FxMode, Look, Tone } from "./Backdrop";

export type SettingsPage = "general" | "display" | "knobs" | "color" | "tests" | "device" | "profiles" | "media" | "about";
export type SaveState = "idle" | "saving" | "saved";

export type App = {
  d: ReturnType<typeof useDaemon>;
  profile: Profile | undefined;           // the profile being viewed/edited
  setCurrent: (id: string) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  updateControl: (id: string, c: Ctl | null) => void;
  swapControls: (a: string, b: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  saveState: SaveState;
  openSettings: (page?: SettingsPage) => void;
  openPalette: () => void;
  listen: boolean;
  setListen: (v: boolean) => void;
  nudgeKnob: (id: string, dir: number) => void;
  look: Look; setLook: (l: Look) => void;
  fx: FxMode; setFx: (m: FxMode) => void;
  held: boolean; followPush: () => void;
  savedAt: number | null;
  undo: () => void; canUndo: boolean; revert: () => void; canRevert: boolean;
  sceneHl: number | null; setSceneHl: (i: number | null) => void;
  tone: Tone; setTone: (t: Tone) => void;
};

export const AppCtx = createContext<App>(null as unknown as App);
export const useApp = () => useContext(AppCtx);

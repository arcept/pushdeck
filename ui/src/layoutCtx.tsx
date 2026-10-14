import { createContext, useContext, useState, type ReactNode } from "react";
import { useLayoutEditor, type Editor } from "./DisplayEditor";

export type RightMode = "controls" | "widgets";
type L = { ed: Editor; mode: RightMode; setMode: (m: RightMode) => void };
const Ctx = createContext<L>(null as unknown as L);
export const useLayout = () => useContext(Ctx);

// The right column is either the Controls (selected control + actions) or the Widgets for the screen. One editing state serves the column and the grid on the picture.
export function LayoutProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<RightMode>("controls");
  const ed = useLayoutEditor(mode === "widgets");
  return <Ctx.Provider value={{ ed, mode, setMode }}>{children}</Ctx.Provider>;
}

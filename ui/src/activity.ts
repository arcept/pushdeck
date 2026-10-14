import { useEffect, useState } from "react";

// The page counts as active when it is visible and its window has focus. Animation and the screen preview pause otherwise.
export const isActive = () => document.visibilityState === "visible" && document.hasFocus();

export function useActive() {
  const [on, setOn] = useState(isActive);
  useEffect(() => {
    const f = () => setOn(isActive());
    document.addEventListener("visibilitychange", f); window.addEventListener("focus", f); window.addEventListener("blur", f);
    return () => { document.removeEventListener("visibilitychange", f); window.removeEventListener("focus", f); window.removeEventListener("blur", f); };
  }, []);
  return on;
}

// CSS animations (the logo and the pad wave) keep the graphics process busy too: pause them all while idle.
const mark = () => document.documentElement.toggleAttribute("data-idle", !isActive());
document.addEventListener("visibilitychange", mark); window.addEventListener("focus", mark); window.addEventListener("blur", mark); mark();

import { useSyncExternalStore } from "react";

// Which layer of scene buttons the replica shows: 0 = buttons 1-8, 1 = Shift + buttons (profiles 9-16).
let page = 0;
const subs = new Set<() => void>();
export const setScenePage = (p: number) => { page = p; subs.forEach((f) => f()); };
export const useScenePage = (): [number, (p: number) => void] => [useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => page), setScenePage];

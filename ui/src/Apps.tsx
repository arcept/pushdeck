import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { Tip } from "./ui";

// An installed Mac app shown by its real name and icon (looked up by the daemon from the bundle id).
type Info = { name: string; installed: boolean };
const cache = new Map<string, Info>();
export function useAppInfo(bundle: string): Info | null {
  const [info, setInfo] = useState<Info | null>(cache.get(bundle) ?? null);
  useEffect(() => {
    if (cache.has(bundle)) { setInfo(cache.get(bundle)!); return; }
    let live = true;
    fetch(`/api/app/${encodeURIComponent(bundle)}`).then((r) => r.json()).then((i: Info) => { cache.set(bundle, i); if (live) setInfo(i); }).catch(() => {});
    return () => { live = false; };
  }, [bundle]);
  return info;
}

export function AppIcon({ bundle, size = 22 }: { bundle: string; size?: number }) {
  const [bad, setBad] = useState(false);
  return bad
    ? <span className="appico fallback" style={{ width: size, height: size }}><Icon name="app" size={Math.round(size * 0.7)} /></span>
    : <img className="appico" width={size} height={size} src={`/api/app-icon/${encodeURIComponent(bundle)}`} alt="" onError={() => setBad(true)} />;
}

export function AppRow({ bundle, onRemove }: { bundle: string; onRemove: () => void }) {
  const info = useAppInfo(bundle);
  const name = info?.installed ? info.name : bundle;
  return (
    <div className="approw">
      <Tip align="left" title={name} desc={info?.installed === false ? `${bundle} · not installed on this Mac` : bundle}>
        <span className="appid"><AppIcon bundle={bundle} /><span className="appname">{name}</span></span>
      </Tip>
      <button className="btn ghost icon sm" aria-label={`Stop turning on for ${name}`} onClick={onRemove}><Icon name="x" size={14} /></button>
    </div>
  );
}

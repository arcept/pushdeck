"use client";

import { useEffect, useRef } from "react";
import { DISPLAY, VIEW, box } from "@/components/Device";

// A close-up of the Push around its display: the knobs above, the buttons around, the screen in the middle.
// The edges fall away through a blurred copy of the same art (a gradient blur, not a flat one), and the screen glows in the profile's colour.
// All of it is static except the screen recordings, which crossfade with the step.

const CROP = { x: 230, y: 270, w: 1100, h: 430 };   // in the SVG's root units

const art = {
  width: `${(VIEW.w / CROP.w) * 100}%`,
  left: `${((VIEW.x - CROP.x) / CROP.w) * 100}%`,
  top: `${((VIEW.y - CROP.y) / CROP.h) * 100}%`,
};

function Art({ videos, step, glows }: { videos: string[]; step: number; glows?: string[] }) {
  return (
    <div className="dz-art" style={{ ...art, aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
      <img src="/img/push2-device.svg" alt="" draggable={false} />
      <img src="/img/push2-lights.svg" alt="" draggable={false} />
      {glows && glows.map((g, i) => (
        <div key={i} className={`dz-glow${i === step ? " on" : ""}`} style={{ ...box({ x: DISPLAY.x - 160, y: DISPLAY.y - 140, w: DISPLAY.w + 320, h: DISPLAY.h + 280 }), background: `radial-gradient(closest-side, ${g}88, ${g}22 55%, transparent)` }} />
      ))}
      {videos.map((v, i) => (
        <video key={v} className={`dz-screen${i === step ? " on" : ""}`} src={v} style={box(DISPLAY)} muted loop playsInline preload="metadata" aria-hidden="true" />
      ))}
    </div>
  );
}

export default function DisplayZoom({ videos, glows, step, label }: { videos: string[]; glows: string[]; step: number; label: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  // only the screen that is showing plays, and only while the section is on screen (a video decodes whether or not you can see it)
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    let visible = false;
    const apply = () => el.querySelectorAll<HTMLVideoElement>(".dz-sharp video").forEach((v, i) => { if (visible && i === step) v.play().catch(() => {}); else v.pause(); });
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; apply(); }, { rootMargin: "120px" });
    io.observe(el); apply();
    return () => io.disconnect();
  }, [step]);
  return (
    <div ref={wrap} className="dz" role="img" aria-label={label} style={{ aspectRatio: `${CROP.w} / ${CROP.h}` }}>
      <div className="dz-soft" aria-hidden="true"><Art videos={[]} step={-1} /></div>
      <div className="dz-sharp"><Art videos={videos} step={step} glows={glows} /></div>
    </div>
  );
}

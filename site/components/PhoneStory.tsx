"use client";

import { useEffect, useRef, useState } from "react";
import { PAD_COLORS, tour } from "@/content";
import type { steps as Steps } from "@/content";

// The phone (and reduced-motion) version of the page's stories: swipeable cards that play only while they are on screen,
// with page dots. Everything is CSS animation, paused until a card is the one in view; reduced motion shows the finished frame.

const img = (n: string) => `/img/${n}`;

/** Which card of a swipe row is in view, and a way to scroll to one. */
function useSwipe(count: number) {
  const row = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(0);
  useEffect(() => {
    const el = row.current; if (!el) return;
    const cards = [...el.children] as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setOn(cards.indexOf(e.target as HTMLElement)); });
    }, { root: el, threshold: 0.6 });
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [count]);
  const go = (i: number) => (row.current?.children[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  return { row, on, go };
}

function Dots({ n, on, go, label }: { n: number; on: number; go: (i: number) => void; label: string }) {
  return (
    <div className="cdots" role="tablist" aria-label={label}>
      {Array.from({ length: n }, (_, i) => <button key={i} type="button" role="tab" aria-selected={i === on} aria-label={`Card ${i + 1} of ${n}`} className={i === on ? "on" : ""} onClick={() => go(i)} />)}
    </div>
  );
}

/** One animated scene per tour step, built from the same crops the desktop tour uses. */
function Scene({ k }: { k: string }) {
  if (k === "select") return (
    <div className="sc sc-select"><img src={img("tour/select.webp")} alt="" /><i className="tap" style={{ left: "33%", top: "87%" }} /></div>
  );
  if (k === "drag") return (
    <div className="sc sc-drag">
      <img src={img("tour/drag-over.webp")} alt="" />
      <img className="done" src={img("tour/drag-done.webp")} alt="" />
      <img className="chip" src={img("tour/chip.webp")} alt="" />
    </div>
  );
  if (k === "profiles") return (
    <div className="sc sc-prof"><img src={img("tour/prof-claude.webp")} alt="" /><img className="p2" src={img("tour/prof-browser.webp")} alt="" /><img className="p3" src={img("tour/prof-codex.webp")} alt="" /></div>
  );
  if (k === "display") return (
    <div className="sc sc-disp"><video className="vid" src="/video/hero.mp4" muted loop playsInline preload="metadata" aria-hidden="true" /></div>
  );
  return <div className="sc sc-onb"><img src={img("tour/onb-welcome.webp")} alt="" /><img className="p2" src={img("tour/onb-perm.webp")} alt="" /></div>;
}

export function TourCards() {
  const { row, on, go } = useSwipe(tour.length);
  // the card in view plays (video included); the rest wait
  useEffect(() => {
    const cards = [...(row.current?.children ?? [])] as HTMLElement[];
    cards.forEach((c, i) => { const v = c.querySelector("video"); if (v) (i === on ? v.play().catch(() => {}) : v.pause()); });
  }, [on, row]);
  return (
    <div>
      <div className="carousel" ref={row} data-reveal>
        {tour.map((t, i) => (
          <article className={`tcard${i === on ? " live" : ""}`} key={t.key} style={{ ["--acc" as string]: t.accent }}>
            <div className="tcard-img" role="img" aria-label={t.alt}><Scene k={t.key} /></div>
            <div className="tcard-txt"><p className="tag">{t.tag}</p><h3>{t.title}</h3><p>{t.text}</p></div>
          </article>
        ))}
      </div>
      <Dots n={tour.length} on={on} go={go} label="Tour cards" />
    </div>
  );
}

/** The display is the point: one wide screen with the Push around it. Pick (or swipe to) a sample profile and the screen, the button lights and the pads all change with it. */
export function ProfileCards({ steps }: { steps: typeof Steps }) {
  const [on, setOn] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.25 });
    io.observe(el); return () => io.disconnect();
  }, []);
  useEffect(() => {
    [...(box.current?.querySelectorAll("video") ?? [])].forEach((v, i) => { if (seen && i === on) v.play().catch(() => {}); else v.pause(); });
  }, [on, seen]);
  const cur = steps[on];
  const col = (i: number) => PAD_COLORS[cur.colors[i % cur.colors.length]];
  const x0 = useRef(0);
  const go = (d: number) => setOn((o) => (o + d + steps.length) % steps.length);
  return (
    <div className="pstage" ref={box} style={{ ["--glow" as string]: cur.glow }}
      onTouchStart={(e) => { x0.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - x0.current; if (Math.abs(dx) > 44) go(dx < 0 ? 1 : -1); }}>
      <div className="ps-device" aria-hidden="true">
        <div className="ps-lights">{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ background: col(k * 3 + 1) }} />)}</div>
        <div className="ps-screen">
          {steps.map((s, i) => <video key={s.name} className={i === on ? "on" : ""} src={s.video} muted loop playsInline preload="metadata" />)}
        </div>
        <div className="ps-lights">{Array.from({ length: 8 }, (_, k) => <i key={k} style={{ background: col(k * 2 + 2) }} />)}</div>
        <div className="ps-pads">{Array.from({ length: 16 }, (_, k) => <i key={k} style={{ background: k % 3 === 1 ? "rgba(255,255,255,.08)" : col(k + (k >> 2)) }} />)}</div>
      </div>
      <div className="ps-chips" role="tablist" aria-label="Sample profiles">
        {steps.map((s, i) => <button key={s.name} type="button" role="tab" aria-selected={i === on} className={i === on ? "on" : ""} style={{ ["--c" as string]: s.glow }} onClick={() => setOn(i)}>{s.name}</button>)}
        <span className="ps-more" aria-hidden="true">+ any app</span>
      </div>
      <div className="ps-text" aria-live="polite"><h3>{cur.name}</h3><p>{cur.text}</p></div>
      <p className="fine">Just three samples. Every app can have its own profile: its own pads, its own button lights and its own screen. Switch app and the Push follows.</p>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { PAD_COLORS, REAL_CLIP, tour } from "@/content";
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

/** The three profiles as swipeable cards: the display recording of the one in view plays, the pads show its colours. */
export function ProfileCards({ steps }: { steps: typeof Steps }) {
  const { row, on, go } = useSwipe(steps.length);
  useEffect(() => {
    const cards = [...(row.current?.children ?? [])] as HTMLElement[];
    cards.forEach((c, i) => { const v = c.querySelector("video"); if (v) (i === on ? v.play().catch(() => {}) : v.pause()); });
  }, [on, row]);
  return (
    <div className="pcards">
      <div className="carousel" ref={row}>
        {steps.map((s, i) => (
          <article className="tcard pcard" key={s.name} style={{ ["--acc" as string]: s.glow }}>
            <div className="pc-screen" style={{ boxShadow: `0 0 60px ${s.glow}33` }}>
              <video src={s.video} muted loop playsInline preload="metadata" aria-label={`The ${s.name} profile on the Push 2 display`} />
            </div>
            <div className="pc-pads" aria-hidden="true">{Array.from({ length: 16 }, (_, k) => <i key={k} style={{ background: k % 3 === 1 ? "rgba(255,255,255,.1)" : PAD_COLORS[s.colors[(k + (k >> 2)) % s.colors.length]] }} />)}</div>
            <div className="tcard-txt"><p className="tag" style={{ color: s.glow }}>Profile {i + 1}</p><h3>{s.name}</h3><p>{s.text}</p></div>
          </article>
        ))}
      </div>
      <Dots n={steps.length} on={on} go={go} label="Profiles" />
    </div>
  );
}

/** A short loop right under the phone hero: the display changing with the app in front (or your own clip, if REAL_CLIP is set). */
export function SeeItMove() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current, v = el?.querySelector("video"); if (!el || !v) return;
    const io = new IntersectionObserver(([e]) => { e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section className="band seeit" aria-label="The display changing with the app in front">
      <p className="tag" data-reveal>Live</p>
      <h2 data-reveal>It moves with you.</h2>
      <div ref={box} className={`seeit-frame${REAL_CLIP ? " real" : ""}`} data-reveal>
        <video src={REAL_CLIP || "/video/hero.mp4"} muted loop playsInline preload="metadata" aria-hidden="true" />
      </div>
      <p className="fine" style={{ marginTop: 12 }}>{REAL_CLIP ? "The Push 2, switching as the app in front changes." : "The Push 2 display, recorded live as the app in front changes: Claude Code, then Browser."}</p>
    </section>
  );
}

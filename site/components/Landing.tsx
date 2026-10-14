"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Device, { IN_APP } from "@/components/Device";
import {
  ISSUES, PAD_COLORS, RELEASES, RELEASE_LIVE, REPO, claudeNote, copy, disclaimer, features,
  install, installNote, requirements, steps,
} from "@/content";

// Motion rules: GSAP only animates transform and opacity (the app learned that glow/filter animation costs GPU).
// Everything is set up inside gsap.matchMedia, so with reduced motion the page is simply static.

const img = (n: string) => `/img/${n}`;

// Two pieces of the real app floating beside the device in the hero. depth = how far they move with the pointer; dir = which way they leave on scroll.
const layers = [
  { src: "ui/profile.webp", w: 545, h: 1132, alt: "Profile settings for Claude Code, the active profile on the Push", cls: "l-profile", depth: 1, dir: -1 },
  { src: "ui/menu-display.webp", w: 558, h: 833, alt: "The menu bar panel: display and pad brightness, live Claude usage", cls: "l-menu", depth: 1.3, dir: 1 },
];

const heroPalette = [0, 4, 2, 1, 3, 6, 5, 7];

// The hero's big move needs room and motion: wide screens without reduced motion. Everything else gets a still version.
const SCROLL_MQ = "(prefers-reduced-motion: no-preference) and (min-width: 900px)";

function PadMark() {
  return (
    <span className="mark" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ ["--i" as string]: (i % 3) + Math.floor(i / 3) }} />)}
    </span>
  );
}

function CopyCmd({ cmd, live }: { cmd: string; live: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="cmd">
      <code>{cmd}</code>
      <button
        type="button"
        aria-label="Copy command"
        disabled={!live}
        onClick={() => { navigator.clipboard?.writeText(cmd).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); }).catch(() => {}); }}
      >{done ? "Copied" : "Copy"}</button>
    </div>
  );
}

export default function Landing({ version }: { version: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [scroll, setScroll] = useState(false);       // the device-into-the-app hero is on
  const [fadePads, setFadePads] = useState(false);   // ?pads=fade: inside the app, the live pads give way to the real screenshot
  const [padsOff, setPadsOff] = useState(false);

  useEffect(() => {
    const mq = matchMedia(SCROLL_MQ);
    const on = () => setScroll(mq.matches);
    on(); mq.addEventListener("change", on);
    setFadePads(new URLSearchParams(location.search).get("pads") === "fade");
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    gsap.ticker.lagSmoothing(0); // on a slow frame, skip ahead instead of stretching time
    const mm = gsap.matchMedia();

    mm.add({ ok: "(prefers-reduced-motion: no-preference)", wide: "(min-width: 900px)" }, (ctx) => {
      const { ok, wide } = ctx.conditions as { ok: boolean; wide: boolean };
      if (!ok) return;
      const q = gsap.utils.selector(root);
      const cleanups: (() => void)[] = [];

      // Load: copy rises, the device swings up, the two UI pieces spring in.
      const intro = gsap.timeline({ defaults: { ease: "back.out(1.6)" } });
      intro.from(q(".nav-in > *"), { opacity: 0, y: -12, duration: 0.6, stagger: 0.06, ease: "power3.out" })
        .from(q(".hero-copy > *"), { opacity: 0, y: 40, duration: 0.9, stagger: 0.08 }, 0.05)
        .from(q(".rise"), { y: 160, scale: 0.92, opacity: 0, duration: 1.4, ease: "power3.out" }, 0.25)
        .from(q(".layer .card"), { opacity: 0, scale: 0.7, y: 60, duration: 1, stagger: 0.12, ease: "back.out(1.7)" }, 0.8);

      q(".layer .float").forEach((el, i) => {
        gsap.to(el, { y: i % 2 ? 10 : -10, duration: 2.8 + i * 0.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.8 });
      });

      // The hero's big move: the device grows, lies flat and lands on the replica inside the app window, and the window fills in around it.
      const win = q(".win")[0], dev = q(".win-device")[0], slot = q(".slot")[0], hero = q(".hero")[0];
      let tl: gsap.core.Timeline | undefined;
      if (scroll && win && dev && slot) {
        let from = { x: 0, y: 0, scale: 1 };
        // Layout boxes only (offsetLeft/Top), so the load animation and the pointer tilt can't skew the numbers.
        const tilt = win.parentElement as HTMLElement;
        const measure = () => {
          const W = tilt.offsetWidth, H = W * 0.625;
          const dw = IN_APP.width * W, dcx = tilt.offsetLeft + (IN_APP.left + IN_APP.width / 2) * W, dcy = tilt.offsetTop + (IN_APP.top + IN_APP.height / 2) * H;
          const scx = slot.offsetLeft + slot.offsetWidth / 2, scy = slot.offsetTop + slot.offsetHeight / 2;
          from = { scale: slot.offsetWidth / dw, x: scx - dcx, y: scy - dcy };
        };
        measure();
        ScrollTrigger.addEventListener("refreshInit", measure);
        cleanups.push(() => ScrollTrigger.removeEventListener("refreshInit", measure));

        tl = gsap.timeline({
          scrollTrigger: {
            trigger: hero, start: "top top", end: "+=1900", pin: true, scrub: 0.7, invalidateOnRefresh: true, anticipatePin: 1,
            onUpdate: (st) => setPadsOff(st.progress > 0.8),
          },
        });
        tl.fromTo(win, { x: () => from.x, y: () => from.y, scale: () => from.scale, rotationX: 22 }, { x: 0, y: 0, scale: 1, rotationX: 0, duration: 1, ease: "power2.inOut" }, 0)
          .to(q(".hero-copy"), { opacity: 0, y: -90, duration: 0.35, ease: "power1.in" }, 0)
          .to(q(".win-shadow"), { opacity: 0, duration: 0.4 }, 0.4)
          .fromTo(q(".win-ui"), { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.inOut" }, 0.4);
        q(".layer").forEach((el, i) => {
          tl!.to(el, { x: layers[i].dir * 320, y: -80, opacity: 0, duration: 0.45, ease: "power1.in" }, 0);
        });
        tl.to({}, { duration: 0.6 }); // a beat to look at the app before the page moves on
      }

      if (wide) {
        // Pointer: the pieces drift by depth, the device leans toward the pointer (only while it is still a device).
        const movers = q(".layer .par").map((el, i) => ({
          x: gsap.quickTo(el, "x", { duration: 0.9, ease: "power3.out" }),
          y: gsap.quickTo(el, "y", { duration: 0.9, ease: "power3.out" }),
          d: layers[i].depth,
        }));
        const tilt = q(".tilt")[0];
        const rx = tilt && gsap.quickTo(tilt, "rotationX", { duration: 1, ease: "power3.out" });
        const ry = tilt && gsap.quickTo(tilt, "rotationY", { duration: 1, ease: "power3.out" });
        const onMove = (e: PointerEvent) => {
          const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
          const k = tl?.scrollTrigger ? Math.max(0, 1 - tl.scrollTrigger.progress * 4) : 1;
          movers.forEach((m) => { m.x(nx * -36 * m.d); m.y(ny * -28 * m.d); });
          if (rx && ry) { rx(ny * -6 * k); ry(nx * 8 * k); }
        };
        window.addEventListener("pointermove", onMove);
        cleanups.push(() => window.removeEventListener("pointermove", onMove));
      }

      // Everything marked data-reveal springs in as it enters, a few at a time.
      gsap.set(q("[data-reveal]"), { opacity: 0, y: 60 });
      ScrollTrigger.batch(q("[data-reveal]"), {
        start: "top 88%", once: true,
        onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.85, ease: "back.out(1.7)", stagger: 0.08, overwrite: true }),
      });

      // Profiles: the section pins and the scroll steps through three profiles; the device's pads change colour with each.
      const sec = q("[data-pin]")[0];
      if (wide && sec) {
        const caps = q("[data-cap]");
        gsap.set(caps.slice(1), { opacity: 0, y: 40 });
        const pin = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: sec, start: "top top", end: "+=2200", scrub: 0.6, pin: true, anticipatePin: 1,
            onUpdate: (st) => setStep(Math.min(steps.length - 1, Math.floor(st.progress * steps.length))),
          },
        });
        pin.to(q(".progress i"), { scaleX: 1, duration: 3 }, 0);
        for (let i = 1; i < steps.length; i++) {
          pin.to(caps[i - 1], { opacity: 0, y: -40, duration: 0.2 }, i - 0.25)
            .to(caps[i], { opacity: 1, y: 0, duration: 0.25 }, i);
        }
      }

      return () => cleanups.forEach((f) => f());
    }, root.current ?? undefined);

    return () => mm.revert();
  }, [scroll]);

  const origin = `${(IN_APP.left + IN_APP.width / 2) * 100}% ${(IN_APP.top + IN_APP.height / 2) * 100}%`;
  const heroDevice = <Device palette={heroPalette} intro={1.2} paused={fadePads && padsOff} label="An Ableton Push 2 running Push Deck: lit pads and the live display" />;

  return (
    <div ref={root} className="page">
      <header className="nav">
        <div className="nav-in">
          <a className="brand" href="#top"><PadMark /><span className="name">Push Deck</span></a>
          <nav aria-label="Sections">
            <a href="#profiles">Profiles</a><a href="#features">Features</a><a href="#privacy">Privacy</a><a href="#install">Install</a>
          </nav>
          <a className="btn ghost small" href={REPO}>GitHub</a>
        </div>
      </header>

      <main id="top">
        <section className={`hero${scroll ? " is-scroll" : ""}`}>
          <div className="hero-copy">
            <p className="kicker"><span className="dots" aria-hidden="true">{PAD_COLORS.slice(0, 4).map((c) => <i key={c} style={{ background: c }} />)}</span>{copy.kicker}</p>
            <h1>Your Push 2, your desk, <span className="rainbow">your rules.</span></h1>
            <p className="sub">{copy.sub}</p>
            <div className="cta">
              <a className="btn primary" href={RELEASE_LIVE ? RELEASES : "#install"}>{RELEASE_LIVE ? `Download ${version}` : "Get Push Deck"}</a>
              <a className="btn ghost" href={REPO}>View on GitHub</a>
            </div>
          </div>

          {/* Where the device sits in the hero. On the still version it holds the device itself; on the scroll version it is an empty box the window is measured against. */}
          <div className="slot">
            {!scroll && <div className="rise">{heroDevice}</div>}
            {layers.map((l) => (
              <div key={l.cls} className={`layer ${l.cls}`}>
                <div className="par"><div className="float"><div className="card"><img src={img(l.src)} alt={l.alt} width={l.w} height={l.h} /></div></div></div>
              </div>
            ))}
          </div>

          {scroll && (
            <div className="tilt rise" style={{ transformOrigin: origin }}>
              <div className="win" style={{ transformOrigin: origin }}>
                <img className="win-ui" src={img("ui/app-ui.webp")} alt="The Push Deck window: the Claude Code profile, a replica of the Push 2 and the controls inspector" width={3200} height={2000} />
                <div className="win-device" style={{ left: `${IN_APP.left * 100}%`, top: `${IN_APP.top * 100}%`, width: `${IN_APP.width * 100}%` }}>
                  <div className="win-shadow" aria-hidden="true" />
                  <div className={fadePads && padsOff ? "dev-fade off" : "dev-fade"}>{heroDevice}</div>
                </div>
              </div>
            </div>
          )}
        </section>

        {!scroll && (
          <section className="band still-app">
            <p className="tag" data-reveal>The app</p>
            <h2 data-reveal>A replica of your Push, in a window.</h2>
            <div className="frame" data-reveal><img src={img("ui/app-ui.webp")} alt="The Push Deck window: the Claude Code profile, a replica of the Push 2 and the controls inspector" width={3200} height={2000} loading="lazy" /></div>
          </section>
        )}

        <section className="stats" aria-label="At a glance">
          {[["64", "pads"], ["960×160", "live display"], ["0", "accounts"], ["127.0.0.1", "only"]].map(([n, l]) => (
            <div key={l} data-reveal><b className="mono">{n}</b><span>{l}</span></div>
          ))}
        </section>

        <section className="pin" id="profiles" data-pin>
          <div className="pin-inner">
            <div className="pin-text">
              <p className="tag">Profiles</p>
              <h2>{copy.displayTitle}</h2>
              <div className="caps">
                {steps.map((s, i) => (
                  <div className="cap" data-cap key={s.name}>
                    <h3><span className="num mono" style={{ background: PAD_COLORS[s.colors[0]] }}>{i + 1}</span>{s.name}</h3>
                    <p>{s.text}</p>
                  </div>
                ))}
              </div>
              <div className="progress" aria-hidden="true"><i /></div>
            </div>
            <div className="pin-stage">
              <Device palette={steps[step].colors} label={`The Push 2 with the ${steps[step].name} profile`} />
            </div>
          </div>
        </section>

        <section className="band" id="features">
          <p className="tag" data-reveal>Features</p>
          <h2 data-reveal>{copy.featuresTitle}</h2>
          <div className="grid">
            {features.map((f, i) => (
              <article key={f.title} data-reveal style={{ ["--c" as string]: PAD_COLORS[i] }}>
                <span className="mini" aria-hidden="true">{Array.from({ length: 9 }, (_, k) => <i key={k} className={(k + i) % 3 === 0 ? "on" : ""} />)}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="band two">
          <figure data-reveal><img className="shot" src={img("setup-welcome.png")} alt="First-run setup, welcome step" loading="lazy" /><figcaption>First-run setup checks your Push and explains each permission.</figcaption></figure>
          <figure data-reveal><img className="shot" src={img("menu-bar.png")} alt="The menu bar panel, three tabs" loading="lazy" /><figcaption>The menu bar: pin a profile, switch the player, set brightness.</figcaption></figure>
        </section>

        <section className="band" id="privacy">
          <p className="tag" data-reveal>Privacy</p>
          <h2 data-reveal>{copy.privacyTitle}</h2>
          <p className="lead" data-reveal>Push Deck runs on your Mac and listens on 127.0.0.1 only. No account, no cloud, no tracking.</p>
          <p className="note" data-reveal>{claudeNote}</p>
        </section>

        <section className="band" id="install">
          <p className="tag" data-reveal>Install</p>
          <h2 data-reveal>{copy.installTitle}</h2>
          <div className="installs">
            {install.map((r, i) => {
              const live = r.id === "src" || RELEASE_LIVE;
              return (
                <article key={r.id} data-reveal style={{ ["--c" as string]: PAD_COLORS[i * 2] }}>
                  <h3>{r.label}{!live && <em className="soon mono">Coming with the first release</em>}</h3>
                  {r.id === "dmg"
                    ? <a className={`btn primary${live ? "" : " muted"}`} href={RELEASES}>{live ? `Download ${version} (.dmg)` : "Watch releases"}</a>
                    : <CopyCmd cmd={r.cmd} live={live} />}
                  <p>{r.note}</p>
                </article>
              );
            })}
          </div>
          <p className="note" data-reveal>{installNote}</p>
          <ul className="req" data-reveal>{requirements.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
      </main>

      <footer>
        <div className="brand"><PadMark /><span className="name">Push Deck</span><span className="ver mono">v{version}</span></div>
        <p>{disclaimer}</p>
        <p>MIT licence · © Arcept · <a href={REPO}>Source</a> · <a href={ISSUES}>Issues</a> are open. Pull requests are by invitation for now.</p>
        <p className="mono">Built with AI assistance.</p>
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Device, { IN_APP } from "@/components/Device";
import DisplayZoom from "@/components/DisplayZoom";
import { Check, Copy, Download, Drag, External, GitHub, Pointer, Screen, Widgets } from "@/components/Icons";
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

const NAV = 80;     // room kept clear at the top for the floating nav
const MOVE = 2600;  // scroll distance (px) of the hero's move, before the next section slides over it

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
      >{done ? <Check /> : <Copy />}{done ? "Copied" : "Copy"}</button>
    </div>
  );
}

export default function Landing({ version }: { version: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [scroll, setScroll] = useState(false);       // the device-into-the-app hero is on
  const [fadePads, setFadePads] = useState(true);    // inside the app, the live pads give way to the real screenshot (?pads=live keeps them on)
  const [padsOff, setPadsOff] = useState(false);
  const [sideAngle, setSideAngle] = useState(false);  // ?angle=side: the earlier three-quarter view; default is a balanced, straight-on lean

  useEffect(() => {
    const mq = matchMedia(SCROLL_MQ);
    const on = () => setScroll(mq.matches);
    on(); mq.addEventListener("change", on);
    const qs = new URLSearchParams(location.search);
    setFadePads(qs.get("pads") !== "live");
    setSideAngle(qs.get("angle") === "side");
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
        .from(q(".slot .rise"), { y: 160, scale: 0.92, opacity: 0, duration: 1.4, ease: "power3.out" }, 0.25)
        .from(q(".tilt"), { y: 320, duration: 1.6, ease: "power3.out" }, 0.2)   // no opacity here: it would flatten the 3D device while it fades
        .from(q(".layer .card"), { opacity: 0, scale: 0.7, y: 60, duration: 1, stagger: 0.12, ease: "back.out(1.7)" }, 0.8);

      q(".layer .float").forEach((el, i) => {
        gsap.to(el, { y: i % 2 ? 10 : -10, duration: 2.8 + i * 0.6, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.8 });
      });

      // The hero's big move. The window is laid out at the size where its replica matches the big hero device (so nothing is ever
      // scaled up and blurred), placed so the replica sits exactly on .slot. Scrolling then shrinks it to fit the screen, centred,
      // the rest of the app fades in around the device, the app's text rises in, and the next section slides up over it all.
      const tiltEl = q(".tilt")[0], win = q(".win")[0], slot = q(".slot")[0], hero = q(".hero")[0], over = q(".app-over")[0];
      let tl: gsap.core.Timeline | undefined;
      if (scroll && tiltEl && win && slot && over) {
        let to = { x: 0, y: 0, scale: 1 }, mid = { x: 0, y: 0, scale: 1 };
        const measure = () => {
          const vw = document.documentElement.clientWidth, vh = innerHeight;
          const dh = slot.offsetWidth, W = dh / IN_APP.width, H = W * 0.625;
          const dx = slot.offsetLeft + dh / 2, dy = slot.offsetTop + slot.offsetHeight / 2;   // device centre (hero coordinates)
          const left = dx - (IN_APP.left + IN_APP.width / 2) * W, top = dy - (IN_APP.top + IN_APP.height / 2) * H;
          Object.assign(tiltEl.style, { width: `${W}px`, left: `${left}px`, top: `${top}px` });
          // the end: the window fits the screen width (max 1600) and is centred below the nav. Scaling happens about the device centre.
          const wf = Math.min(1600, vw - 48), f = wf / W, tx = vw / 2, ty = NAV + (vh - NAV) / 2;
          const cx = left + W / 2, cy = top + H / 2;
          to = { scale: f, x: tx - (dx + f * (cx - dx)), y: ty - (dy + f * (cy - dy)) };
          // halfway: the whole slab in view, still at an angle, so its edges and thickness show before it flattens
          const bodyH = slot.offsetHeight * 0.82;
          // (perspective enlarges the near edge, so aim for a bit over half the screen height)
          const ms = Math.min(1, ((vh - NAV) * 0.58) / (bodyH * Math.cos((34 * Math.PI) / 180)));
          mid = { scale: ms, x: vw / 2 - dx, y: NAV + (vh - NAV) * 0.5 - dy };
          // the text overlay sits on the window's final box; its text stays clear of the nav even when the window runs past the top
          const oh = wf * 0.625, ot = ty - oh / 2;
          Object.assign(over.style, { width: `${wf}px`, height: `${oh}px`, left: `${tx - wf / 2}px`, top: `${ot}px`, paddingTop: `${Math.max(ot + 64, NAV + 48) - ot}px` });
        };
        measure();
        ScrollTrigger.addEventListener("refreshInit", measure);
        cleanups.push(() => ScrollTrigger.removeEventListener("refreshInit", measure));
        // any change of the hero's box (a resized window, a scrollbar appearing) re-measures and re-lays the move, so the device never stays off-centre
        let timer = 0;
        const ro = new ResizeObserver(() => { clearTimeout(timer); timer = window.setTimeout(() => ScrollTrigger.refresh(), 120); });
        ro.observe(root.current!);   // not the hero: while it is pinned, its wrapper keeps the old width
        cleanups.push(() => { ro.disconnect(); clearTimeout(timer); });

        // Timeline units are scroll distance / 1000: MOVE px of animation, then one screen height for the next section to slide over.
        const slide = innerHeight / 1000;
        tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: hero, start: "top top", end: () => `+=${MOVE + innerHeight}`, pin: true, pinSpacing: false, scrub: 1.1, invalidateOnRefresh: true, anticipatePin: 1,
            onUpdate: () => setPadsOff((tl?.time() ?? 0) > 1.5),
          },
        });
        // from a steep desk angle (you see its front edge and side) to front-on, landing in the app
        const a0 = sideAngle ? { rotationX: 50, rotationZ: -9, rotationY: -6 } : { rotationX: 52, rotationZ: 0, rotationY: 0 };
        const a1 = sideAngle ? { rotationX: 34, rotationZ: -6, rotationY: -9 } : { rotationX: 36, rotationZ: 0, rotationY: 0 };
        tl.fromTo(win, { x: 0, y: 0, scale: 1, ...a0 },
            { x: () => mid.x, y: () => mid.y, scale: () => mid.scale, ...a1, duration: 0.6, ease: "power2.inOut" }, 0)
          .to(win, { x: () => to.x, y: () => to.y, scale: () => to.scale, rotationX: 0, rotationZ: 0, rotationY: 0, duration: 0.9, ease: "power3.inOut" }, 0.65)
          .to(q(".hero .sheen"), { opacity: 0, duration: 0.7, ease: "power1.in" }, 0.8)
          .to(q(".hero .shade, .hero .disp-glow"), { opacity: 0, duration: 0.7, ease: "power1.inOut" }, 0.75)   // the lights come up as it lands, to match the app
          .to(q(".hero .floor"), { opacity: 0, duration: 0.5 }, 0.9)
          .to(q(".hero-copy"), { opacity: 0, y: -140, duration: 0.4, ease: "power1.in" }, 0)
          .fromTo(q(".win-ui"), { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.inOut" }, 0.95)
          .fromTo(q(".app-grad"), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 1.55)
          .fromTo(q(".app-text > *"), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.07, ease: "power2.out" }, 1.6)
          .to({}, { duration: 0.01 }, MOVE / 1000 - 0.01)                       // hold on the app until the move distance is used up
          .fromTo(q(".hero-dim"), { opacity: 0 }, { opacity: 0.7, duration: slide }, MOVE / 1000);
        q(".layer").forEach((el, i) => {
          tl!.to(el, { x: layers[i].dir * 360, y: -100, opacity: 0, duration: 0.5, ease: "power1.in" }, 0);
        });
      }

      if (wide) {
        // Pointer: the two app pieces drift by depth. The device itself stays put.
        const movers = q(".layer .par").map((el, i) => ({
          x: gsap.quickTo(el, "x", { duration: 0.9, ease: "power3.out" }),
          y: gsap.quickTo(el, "y", { duration: 0.9, ease: "power3.out" }),
          d: layers[i].depth,
        }));
        const onMove = (e: PointerEvent) => {
          const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
          movers.forEach((m) => { m.x(nx * -36 * m.d); m.y(ny * -28 * m.d); });
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
  }, [scroll, sideAngle]);

  const origin = `${(IN_APP.left + IN_APP.width / 2) * 100}% ${(IN_APP.top + IN_APP.height / 2) * 100}%`;
  const appText = (
    <>
      <p className="tag">The app</p>
      <h2>A replica of your Push, in a window.</h2>
      <p className="lead">Everything you set up here lands on the real device straight away.</p>
      <ul className="points">
        <li><Pointer /><span><b>Click any control</b> on the replica to set it up: pads, buttons, knobs.</span></li>
        <li><Drag /><span><b>Drag actions onto the Push</b>: shortcuts, apps, links, text, shell commands.</span></li>
        <li><Screen /><span><b>Mirror the display</b> live, or preview a profile before you switch.</span></li>
        <li><Widgets /><span><b>Arrange widgets</b> on the screen: clock, timers, usage, the player.</span></li>
      </ul>
    </>
  );
  const heroDevice = <Device solid={scroll} palette={heroPalette} intro={1.2} paused={fadePads && padsOff} label="An Ableton Push 2 running Push Deck: lit pads and the live display" />;

  return (
    <div ref={root} className="page">
      <header className="nav">
        <div className="nav-in">
          <a className="brand" href="#top"><PadMark /><span className="name">Push Deck</span></a>
          <nav className="chip links" aria-label="Sections">
            <a href="#profiles">Profiles</a><a href="#features">Features</a><a href="#privacy">Privacy</a><a href="#install">Install</a>
            <a className="gh" href={REPO} target="_blank" rel="noopener" aria-label="Push Deck on GitHub (opens in a new tab)" title="GitHub"><GitHub size={17} /></a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className={`hero${scroll ? " is-scroll" : ""}`}>
          <div className="hero-copy">
            <p className="kicker"><span className="dots" aria-hidden="true">{PAD_COLORS.slice(0, 4).map((c) => <i key={c} style={{ background: c }} />)}</span>{copy.kicker}</p>
            <h1>Your Push 2, your desk, <span className="rainbow">your rules.</span></h1>
            <p className="sub">{copy.sub}</p>
            <div className="cta">
              <a className="btn primary" href={RELEASE_LIVE ? RELEASES : "#install"}><Download />{RELEASE_LIVE ? `Download ${version}` : "Get Push Deck"}</a>
              <a className="btn ghost" href={REPO} target="_blank" rel="noopener"><GitHub />View on GitHub<External className="ext" /></a>
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
                  <div className={fadePads && padsOff ? "dev-fade off" : "dev-fade"}>{heroDevice}</div>
                </div>
              </div>
            </div>
          )}
          {scroll && (
            <div className="app-over">
              <div className="app-grad" aria-hidden="true" />
              <div className="app-text">{appText}</div>
            </div>
          )}
          {scroll && <div className="hero-dim" aria-hidden="true" />}
        </section>

        {scroll && <div style={{ height: MOVE }} aria-hidden="true" />}

        <div className={scroll ? "after is-over" : "after"}>
        {!scroll && (
          <section className="band still-app">
            <div data-reveal>{appText}</div>
            <div className="frame" data-reveal><img src={img("ui/app-ui.webp")} alt="The Push Deck window: the Claude Code profile, a replica of the Push 2 and the controls inspector" width={3200} height={2000} loading="lazy" /></div>
          </section>
        )}

        <section className="pin" id="profiles" data-pin>
          <div className="pin-inner">
            <div className="pin-head">
              <div>
                <p className="tag">Profiles</p>
                <h2>{copy.displayTitle}</h2>
              </div>
              <div>
                <div className="caps">
                  {steps.map((s, i) => (
                    <div className="cap" data-cap key={s.name}>
                      <h3><span className="num mono" style={{ background: s.glow }}>{i + 1}</span>{s.name}</h3>
                      <p>{s.text}</p>
                    </div>
                  ))}
                </div>
                <div className="progress" aria-hidden="true"><i /></div>
              </div>
            </div>
            <DisplayZoom videos={steps.map((s) => s.video)} glows={steps.map((s) => s.glow)} step={step} label={`The Push 2 display with the ${steps[step].name} profile`} />
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
                    ? <a className={`btn primary${live ? "" : " muted"}`} href={RELEASES} target="_blank" rel="noopener">{live ? <><Download />Download {version} (.dmg)</> : <>Watch releases<External className="ext" /></>}</a>
                    : <CopyCmd cmd={r.cmd} live={live} />}
                  <p>{r.note}</p>
                </article>
              );
            })}
          </div>
          <p className="note" data-reveal>{installNote}</p>
          <ul className="req" data-reveal>{requirements.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>
        </div>
      </main>

      <footer>
        <div className="brand"><PadMark /><span className="name">Push Deck</span><span className="ver mono">v{version}</span></div>
        <p>{disclaimer}</p>
        <p>MIT licence · © Arcept · <a href={REPO} target="_blank" rel="noopener"><GitHub size={14} />Source<External className="ext" /></a> · <a href={ISSUES} target="_blank" rel="noopener">Issues<External className="ext" /></a> are open. Pull requests are by invitation for now.</p>
        <p className="mono">Built with AI assistance.</p>
      </footer>
    </div>
  );
}

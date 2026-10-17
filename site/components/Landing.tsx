"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Device, { IN_APP } from "@/components/Device";
import DisplayZoom from "@/components/DisplayZoom";
import { ProfileCards, TourCards } from "@/components/PhoneStory";
import { Ban, Check, CloudOff, Copy, Download, Drag, External, Folder, GitHub, Key, Laptop, Pointer, Screen, Share, Shield, Wave, Widgets } from "@/components/Icons";
import {
  ISSUES, PAD_COLORS, RELEASE_LIVE, REPO, claudeNote, copy, disclaimer, dmgUrl, faq, features, privacyRows,
  install, installNote, requirements, steps, tour,
} from "@/content";

// Motion rules: GSAP only animates transform and opacity (the app learned that glow/filter animation costs GPU).
// Everything is set up inside gsap.matchMedia, so with reduced motion the page is simply static.

const img = (n: string) => `/img/${n}`;

// The tour: where the window is zoomed to at each step (in the 1600x1000 window's own units) and which side of the screen that spot sits on.
// The text takes the other side. The sharper close-ups that fade in over each spot are in public/img/tour.
const TOUR: { region: [number, number, number, number]; side: "l" | "r"; cap?: number }[] = [   // cap: the most this step may zoom, as a multiple of the window's resting size (default 3.4)
  { region: [400, 540, 500, 400], side: "l" },     // a pad selected, its card open
  { region: [580, 580, 500, 340], side: "r" },     // the pads: a chip is dragged in from the right onto one of them
  { region: [14, 100, 276, 320], side: "l", cap: 1.45 },   // the profile header and the Auto / Master switch (a gentler zoom: it is mostly text)
  { region: [480, 400, 480, 100], side: "r" },     // the display
  { region: [310, 160, 980, 680], side: "l" },     // the first-run setup dialog
];
const rect = (x: number, y: number, w: number, h: number) => ({ left: `${(x / 1600) * 100}%`, top: `${(y / 1000) * 100}%`, width: `${(w / 1600) * 100}%`, height: `${(h / 1000) * 100}%` });
const CHIP = { w: 122, h: 36, fromX: 1135, fromY: 770, toX: 758, toY: 702 };   // the "Open URL" chip: it slides in from the right edge of the frame to pad 3,4

const heroPalette = [0, 4, 2, 1, 3, 6, 5, 7];

const NAV = 80;     // room kept clear at the top for the floating nav
const MOVE = 2600;  // scroll distance (px) of the hero's move, before the next section slides over it

// The hero's big move needs room and motion: wide screens without reduced motion. Everything else gets a still version.
const SCROLL_MQ = "(prefers-reduced-motion: no-preference) and (min-width: 900px)";

const ICONS: Record<string, React.ReactNode> = { folder: <Folder />, laptop: <Laptop />, ban: <Ban />, key: <Key />, wave: <Wave />, shield: <Shield /> };

/** The Push 2's pads, for the privacy picture: an 8 x 4 block with a few lit in the pad colours. */
const LIT_PADS: Record<number, number> = { 2: 0, 5: 4, 9: 2, 14: 1, 17: 3, 20: 5, 26: 6, 29: 7 };
function PadBlock() {
  return <span className="pm-pads" aria-hidden="true">{Array.from({ length: 32 }, (_, k) => <i key={k} style={k in LIT_PADS ? { background: PAD_COLORS[LIT_PADS[k]] } : undefined} />)}</span>;
}

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
  const [tourIdx, setTourIdx] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);   // privacy points are an open list on desktop, an accordion on phones
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(min-width: 900px)"); const on = () => setIsDesktop(mq.matches);
    on(); mq.addEventListener("change", on);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    addEventListener("keydown", esc);
    return () => { mq.removeEventListener("change", on); removeEventListener("keydown", esc); };
  }, []);
  const [shared, setShared] = useState(false);
  // Phones can't install a Mac app: offer to send the page to yourself (the share sheet, or the link copied)
  const share = async () => {
    const url = `${location.origin}/`;
    try {
      if (navigator.share) await navigator.share({ title: "Push Deck", text: "Push Deck turns an Ableton Push 2 into a controller for your Mac.", url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2200); }
    } catch { /* closed the share sheet */ }
  };
  const [navCta, setNavCta] = useState(false);   // a Get Push Deck button joins the nav once the first screen is behind you
  useEffect(() => {
    const on = () => setNavCta(scrollY > innerHeight * 0.6);
    on(); addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  const jump = useRef<(i: number) => void>(() => {});
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

  // the hero's display video only runs while the hero is on screen
  useEffect(() => {
    const hero = root.current?.querySelector(".hero"); if (!hero) return;
    const vids = () => hero.querySelectorAll<HTMLVideoElement>("video");
    const io = new IntersectionObserver(([e]) => vids().forEach((v) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause())), { rootMargin: "200px" });
    io.observe(hero);
    return () => io.disconnect();
  }, [scroll]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    gsap.ticker.lagSmoothing(0); // on a slow frame, skip ahead instead of stretching time
    const mm = gsap.matchMedia();

    mm.add({ ok: "(prefers-reduced-motion: no-preference)", wide: "(min-width: 900px)" }, (ctx) => {
      const { ok, wide } = ctx.conditions as { ok: boolean; wide: boolean };
      if (!ok) return;
      const q = gsap.utils.selector(root);
      const cleanups: (() => void)[] = [];

      // Load: copy rises and the device swings up.
      const intro = gsap.timeline({ defaults: { ease: "back.out(1.6)" } });
      intro.from(q(".nav-in > *"), { opacity: 0, y: -12, duration: 0.6, stagger: 0.06, ease: "power3.out" })
        .from(q(".hero-copy > *"), { opacity: 0, y: 40, duration: 0.9, stagger: 0.08 }, 0.05)
        .from(q(".slot .rise"), { y: 160, scale: 0.92, opacity: 0, duration: 1.4, ease: "power3.out" }, 0.25)
        .from(q(".tilt"), { y: 320, duration: 1.6, ease: "power3.out" }, 0.2)   // no opacity here: it would flatten the 3D device while it fades
        .from(q(".scroll-cue"), { opacity: 0, y: 12, duration: 0.8, ease: "power2.out" }, 1.4);

      // The hero's big move. The window is laid out at the size where its replica matches the big hero device (so nothing is ever
      // scaled up and blurred), placed so the replica sits exactly on .slot. Scrolling then shrinks it to fit the screen, centred,
      // the rest of the app fades in around the device, the app's text rises in, and the next section slides up over it all.
      const tiltEl = q(".tilt")[0], win = q(".win")[0], slot = q(".slot")[0], hero = q(".hero")[0], over = q(".app-over")[0];
      let tl: gsap.core.Timeline | undefined;
      if (scroll && tiltEl && win && slot && over) {
        let to = { x: 0, y: 0, scale: 1 }, mid = { x: 0, y: 0, scale: 1 };
        let cams: { x: number; y: number; scale: number }[] = TOUR.map(() => ({ x: 0, y: 0, scale: 1 }));
        let Wpx = 1;   // the window's laid-out width in px (the chip's flight is in the window's units)
        const measure = () => {
          const vw = document.documentElement.clientWidth, vh = innerHeight;
          // Every screen shows the same share of the device on the first view (about 37% of the picture): the slot is placed from the bottom of the screen, not from the text above it.
          slot.style.marginTop = "0px";
          const naturalTop = slot.offsetTop;
          // (the 3D tilt makes a bigger device show a little less of itself, a smaller one a little more, so the share is nudged by size)
          const dsz = slot.offsetWidth, adj = dsz < 1008 ? 0.00015 * (dsz - 1008) : 0.0002 * Math.max(0, dsz - 1020);
          slot.style.marginTop = `${vh - (0.537 + adj) * slot.offsetHeight - naturalTop}px`;
          const dh = slot.offsetWidth, W = dh / IN_APP.width, H = W * 0.625;
          const dx = slot.offsetLeft + dh / 2, dy = slot.offsetTop + slot.offsetHeight / 2;   // device centre (hero coordinates)
          const left = dx - (IN_APP.left + IN_APP.width / 2) * W, top = dy - (IN_APP.top + IN_APP.height / 2) * H;
          Object.assign(tiltEl.style, { width: `${W}px`, left: `${left}px`, top: `${top}px` });
          // the copy sits midway between the nav and where the device starts (the top ~10% of the picture is empty cable fade, so the device visibly starts that far down)
          const copy = q(".hero-copy")[0] as HTMLElement | undefined;
          if (copy) {
            copy.style.top = "0px";
            const from = 66, to = slot.offsetTop + slot.offsetHeight * 0.17;
            copy.style.top = `${from + (to - from - copy.offsetHeight) / 2 - copy.offsetTop + 26}px`;
          }
          // the end: the window fits the screen width (max 1600) and is centred below the nav. Scaling happens about the device centre.
          const wf = Math.min(1600, vw - 48), f = wf / W, tx = vw / 2, ty = NAV + (vh - NAV) / 2;
          const cx = left + W / 2, cy = top + H / 2;
          to = { scale: f, x: tx - (dx + f * (cx - dx)), y: ty - (dy + f * (cy - dy)) };
          // the tour: zoom the window so each region fills about half the screen, on its side, the text taking the other half
          Wpx = W;
          const ox = dx - left, oy = dy - top;
          cams = TOUR.map(({ region: [ux, uy, uw, uh], side, cap }) => {
            const px = ((ux + uw / 2) / 1600) * W, py = ((uy + uh / 2) / 1000) * H, rw = (uw / 1600) * W, rh = (uh / 1000) * H;
            const sc = Math.min((0.5 * wf) / rw, (0.8 * (vh - NAV)) / rh, f * (cap ?? 3.4));
            const Tx = (vw - wf) / 2 + (side === "l" ? 0.27 : 0.73) * wf, Ty = NAV + (vh - NAV) / 2;
            return { scale: sc, x: Tx - dx - (px - ox) * sc, y: Ty - dy - (py - oy) * sc };
          });
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
        const sv = innerHeight / 1000;           // one screen of scrolling
        const u = sv;                            // one tour step = one screen of scrolling
        const T0 = MOVE / 1000, stepT = (i: number) => T0 + i * u, tEnd = T0 + 5 * u + 0.6 * sv;
        const marks = [1.9, ...TOUR.map((_, i) => stepT(i) + 0.76 * u)];   // where each step is fully in view (the page settles on these)
        let shown = 0;
        tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            snap: {
              // inside the tour the page settles on the nearest step, so it never rests half-way between two (both faded)
              snapTo: (p: number, self?: ScrollTrigger) => {
                const dur = tl!.duration(), t = p * dur, lo = marks[0] - 0.25, hi = marks[marks.length - 1] + 0.4 * u;
                if (t < lo || t > hi) return p;
                // the two steps either side of where the scroll stopped; a small push in a direction (a tenth of a step) is enough to go that way
                let a = 0; marks.forEach((m, i) => { if (m <= t) a = i; });
                const b = Math.min(a + 1, marks.length - 1), span = marks[b] - marks[a] || 1, f = (t - marks[a]) / span;
                const dir = self?.direction ?? 0, go = dir > 0 ? f > 0.1 : dir < 0 ? f > 0.9 : f > 0.5;
                return marks[go ? b : a] / dur;
              },
              duration: { min: 0.3, max: 0.75 }, delay: 0.12, ease: "power2.inOut", inertia: false,   // settle on where the scroll stopped, not where a flick would carry it
            },
            trigger: hero, start: "top top", end: () => `+=${MOVE + 6.6 * innerHeight}`, pin: true, pinSpacing: false, scrub: 1.1, invalidateOnRefresh: true, anticipatePin: 1,
          },
          // driven by the timeline's own time (the scrub lags the scroll), so it is right even after a jump
          onUpdate: () => {
            const now = tl?.time() ?? 0;
            setPadsOff(now > 1.5);
            let k = 0; marks.forEach((m, i) => { if (now >= m - 0.2 * u) k = i; });
            if (k !== shown) { shown = k; setTourIdx(k); }
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
          .to(q(".scroll-cue"), { opacity: 0, duration: 0.25 }, 0)
          .fromTo(q(".win-ui"), { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.inOut" }, 0.95)
          .fromTo(q(".app-grad"), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 1.55)
          .fromTo(q(".app-text > *"), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.07, ease: "power2.out" }, 1.6)
          .to({}, { duration: 0.01 }, T0 - 0.01);                       // hold on the app until the move distance is used up

        // The tour. Each step: the camera (the window itself) glides to a spot, the text of that step rises on the opposite side,
        // and where it helps a sharper close-up fades in over the spot. Everything is opacity and transform.
        const txt = q(".tour-step"), glow = q(".tour-glow"), scrim = { l: q(".tour-scrim.sl")[0], r: q(".tour-scrim.sr")[0] };
        const zl = (n: string) => q(`.zl-${n}`);
        tl.fromTo(q(".tour-top, .tour-edge"), { opacity: 0 }, { opacity: 1, duration: 0.3 * u }, T0);   // a soft fade under the nav, so the window's own title bar never competes with the page's
        TOUR.forEach((s, k) => {
          const t = stepT(k);
          tl!.to(win, { x: () => cams[k].x, y: () => cams[k].y, scale: () => cams[k].scale, duration: 0.36 * u, ease: "power3.inOut" }, t);
          if (k === 0) tl!.to(q(".app-text, .app-grad"), { opacity: 0, duration: 0.25 * u }, t);
          const textSide = s.side === "l" ? "r" : "l";
          tl!.fromTo(txt[k], { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.18 * u, ease: "power2.out" }, t + 0.26 * u)
            .to(txt[k], { opacity: 0, y: -24, duration: 0.12 * u, ease: "power1.in" }, t + 0.86 * u)
            .fromTo(glow[k], { opacity: 0 }, { opacity: 1, duration: 0.2 * u }, t + 0.18 * u)
            .to(glow[k], { opacity: 0, duration: 0.12 * u }, t + 0.86 * u)
            .fromTo(scrim[textSide], { opacity: 0 }, { opacity: 1, duration: 0.14 * u }, t + 0.18 * u)
            .to(scrim[textSide], { opacity: 0, duration: 0.1 * u }, t + 0.9 * u);
        });
        // 1. a pad is selected
        tl.fromTo(zl("select"), { opacity: 0 }, { opacity: 1, duration: 0.15 * u }, stepT(0) + 0.32 * u).to(zl("select"), { opacity: 0, duration: 0.1 * u }, stepT(0) + 0.9 * u);
        // 2. a chip flies from the edge of the frame onto a pad, the pad lights up
        const d = stepT(1), kx = () => Wpx / 1600;
        tl.fromTo(zl("over"), { opacity: 0 }, { opacity: 1, duration: 0.12 * u }, d + 0.26 * u)
          .fromTo(q(".zl-chip"), { opacity: 0, x: 0, y: 0 }, { opacity: 1, duration: 0.08 * u }, d + 0.26 * u)
          .to(q(".zl-chip"), { x: () => (CHIP.toX - CHIP.fromX) * kx(), y: () => (CHIP.toY - CHIP.fromY) * kx(), duration: 0.3 * u, ease: "power2.inOut" }, d + 0.32 * u)
          .fromTo(zl("done"), { opacity: 0 }, { opacity: 1, duration: 0.08 * u }, d + 0.6 * u)
          .to(q(".zl-chip"), { opacity: 0, duration: 0.06 * u }, d + 0.62 * u)
          .to(zl("over"), { opacity: 0, duration: 0.08 * u }, d + 0.66 * u)
          .to(zl("done"), { opacity: 0, duration: 0.1 * u }, d + 0.9 * u);
        // 3. three profiles, one after the other (the page rests on the last one)
        const p3 = stepT(2);
        tl.fromTo(zl("p-claude"), { opacity: 0 }, { opacity: 1, duration: 0.1 * u }, p3 + 0.26 * u)
          .fromTo(zl("p-browser"), { opacity: 0 }, { opacity: 1, duration: 0.08 * u }, p3 + 0.42 * u)
          .fromTo(zl("p-codex"), { opacity: 0 }, { opacity: 1, duration: 0.08 * u }, p3 + 0.58 * u)
          .to(q(".zl-p-claude, .zl-p-browser, .zl-p-codex"), { opacity: 0, duration: 0.1 * u }, p3 + 0.9 * u);
        // 4. the display: a ring around it
        tl.fromTo(zl("ring"), { opacity: 0 }, { opacity: 1, duration: 0.15 * u }, stepT(3) + 0.3 * u).to(zl("ring"), { opacity: 0, duration: 0.1 * u }, stepT(3) + 0.9 * u);
        // 5. the first-run setup: the window dims, the dialog shows, then its second page
        const s5 = stepT(4);
        tl.fromTo(q(".win-dim"), { opacity: 0 }, { opacity: 0.8, duration: 0.2 * u }, s5 + 0.2 * u)
          .fromTo(zl("onb-1"), { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.2 * u, ease: "power2.out" }, s5 + 0.26 * u)
          .fromTo(zl("onb-2"), { opacity: 0 }, { opacity: 1, duration: 0.1 * u }, s5 + 0.56 * u)
          .to(q(".zl-onb-1, .zl-onb-2"), { opacity: 0, duration: 0.1 * u }, s5 + 0.9 * u);
        // 6. back out to the whole window; then the next section slides over it
        const z = stepT(5);
        tl.to(win, { x: () => to.x, y: () => to.y, scale: () => to.scale, duration: 0.5 * sv, ease: "power2.inOut" }, z)
          .to(q(".win-dim"), { opacity: 0, duration: 0.3 * u }, z)
          .to(q(".tour-top, .tour-edge"), { opacity: 0, duration: 0.3 * sv }, z)
          .fromTo(q(".tour-rail, .tour-skip"), { opacity: 0 }, { opacity: 1, duration: 0.1 }, 1.7)
          .to(q(".tour-rail, .tour-skip"), { opacity: 0, duration: 0.1 * u }, z)
          .fromTo(q(".hero-dim"), { opacity: 0 }, { opacity: 0.7, duration: sv }, tEnd);
        jump.current = (i: number) => {
          const st = tl!.scrollTrigger; if (!st) return;
          const y = st.start + (marks[i] / tl!.duration()) * (st.end - st.start);
          window.scrollTo({ top: y, behavior: "smooth" });
        };
      }


      // The menu bar scene loops while it is on screen: the cursor goes to the icon, clicks, the panel drops down, two tabs are clicked, the panel closes.
      // Only the cursor, the panel and its pictures move; the desktop itself is still.
      const desk = q(".desk")[0] as HTMLElement | undefined;
      if (desk) {
        const panel = desk.querySelector(".desk-panel") as HTMLElement, icon = desk.querySelector(".b-pd") as HTMLElement, cur = desk.querySelector(".desk-cursor") as HTMLElement;
        const pn1 = desk.querySelector(".pn-1"), pn3 = desk.querySelector(".pn-3");
        const at = (el: Element, fx: number, fy: number) => { const d = desk.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - d.left + r.width * fx, y: r.top - d.top + r.height * fy }; };
        const tab = (fx: number) => at(panel, fx, 0.176);   // the tab row of the panel picture
        const loop = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 1.2, defaults: { ease: "power2.inOut" } });
        loop.set(panel, { opacity: 0, y: -10, scaleY: 0.96, transformOrigin: "70% 0%" }, 0)
          .set([pn1, pn3], { opacity: 0 }, 0)
          .set(icon, { backgroundColor: "rgba(255,255,255,0)" }, 0)
          .set(cur, { opacity: 0, scale: 1, x: () => desk.clientWidth * 0.62, y: () => desk.clientHeight * 0.86 }, 0)
          .to(cur, { opacity: 1, duration: 0.3 }, 0.1)
          .to(cur, { x: () => at(icon, 0.45, 0.7).x, y: () => at(icon, 0.45, 0.7).y, duration: 1.1 }, 0.2)
          .to(cur, { scale: 0.82, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" }, 1.4)
          .to(icon, { backgroundColor: "rgba(255,255,255,.16)", duration: 0.15 }, 1.45)
          .to(panel, { opacity: 1, y: 0, scaleY: 1, duration: 0.4, ease: "power3.out" }, 1.55)
          .to(cur, { x: () => tab(0.32).x, y: () => tab(0.32).y, duration: 0.9 }, 2.4)
          .to(cur, { scale: 0.82, duration: 0.1, yoyo: true, repeat: 1 }, 3.3)
          .to(pn1, { opacity: 1, duration: 0.2 }, 3.35)
          .to(cur, { x: () => tab(0.855).x, y: () => tab(0.855).y, duration: 0.9 }, 4.5)
          .to(cur, { scale: 0.82, duration: 0.1, yoyo: true, repeat: 1 }, 5.4)
          .to(pn3, { opacity: 1, duration: 0.2 }, 5.45)
          .to(cur, { opacity: 0, duration: 0.4 }, 6.6)
          .to(panel, { opacity: 0, y: -8, duration: 0.35, ease: "power2.in" }, 7.0)
          .to(icon, { backgroundColor: "rgba(255,255,255,0)", duration: 0.2 }, 7.0);
        const redo = () => loop.invalidate();
        ScrollTrigger.addEventListener("refresh", redo);
        const io = new IntersectionObserver(([e]) => (e.isIntersecting ? loop.play() : loop.pause()), { threshold: 0.2 });   // plays only while the desktop is on screen
        io.observe(desk);
        cleanups.push(() => { ScrollTrigger.removeEventListener("refresh", redo); io.disconnect(); loop.kill(); });
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
  const appBlock = (mid?: React.ReactNode) => (
    <>
      <p className="tag">The app</p>
      <h2>A replica of your Push, in a window.</h2>
      <p className="lead">Everything you set up here lands on the real device straight away.</p>
      {mid}
      <ul className="points">
        <li><Pointer /><span><b>Click any control</b> on the replica to set it up: pads, buttons, knobs.</span></li>
        <li><Drag /><span><b>Drag actions onto the Push</b>: shortcuts, apps, links, text, shell commands.</span></li>
        <li><Screen /><span><b>Mirror the display</b> live, or preview a profile before you switch.</span></li>
        <li><Widgets /><span><b>Arrange widgets</b> on the screen: clock, timers, usage, the player.</span></li>
      </ul>
    </>
  );
  const appText = appBlock();
  const heroDevice = <Device solid palette={heroPalette} intro={1.2} paused={fadePads && padsOff} label="An Ableton Push 2 running Push Deck: lit pads and the live display" />;

  return (
    <div ref={root} className="page">
      <a className="skip" href="#install">Skip to install</a>
      <div className={`mbar${navCta ? " on" : ""}`} role="region" aria-label="Quick actions">
        <a className="btn primary small" href={RELEASE_LIVE ? dmgUrl(version) : "#install"}><Download />Get Push Deck</a>
        <button type="button" className="btn ghost small" onClick={share}><Share />{shared ? "Link copied" : "Send to my Mac"}</button>
      </div>
      <header className="nav">
        <div className="nav-in">
          <a className="brand" href="#top"><PadMark /><span className="name">Push Deck</span></a>
          <nav className="chip links" aria-label="Sections">
            <a href="#profiles">Profiles</a><a href="#features" onClick={(e) => { if (scroll) { e.preventDefault(); jump.current(1); } }}>Features</a><a href="#privacy">Privacy</a><a href="#install">Install</a>
            <button type="button" className="menu-btn" aria-expanded={menu} aria-controls="menu-sheet" onClick={() => setMenu((m) => !m)}>{menu ? "Close" : "Menu"}</button>
            {navCta && <a className="nav-cta" href={RELEASE_LIVE ? dmgUrl(version) : "#install"}>Get Push Deck</a>}
            <a className="gh" href={REPO} target="_blank" rel="noopener" aria-label="Push Deck on GitHub (opens in a new tab)" title="GitHub"><GitHub size={17} /></a>
          </nav>
        </div>
      </header>

      {menu && (
        <>
          <button type="button" className="menu-scrim" aria-label="Close the menu" onClick={() => setMenu(false)} />
          <nav className="menu-sheet" id="menu-sheet" aria-label="Sections">
            {[["Profiles", "#profiles"], ["Menu bar", "#menubar"], ...(isDesktop ? [["Features", "#features"]] : []), ["Privacy", "#privacy"], ["Install", "#install"], ["FAQ", "#faq"]].map(([l, h]) => <a key={h} href={h} onClick={() => setMenu(false)}>{l}</a>)}
          </nav>
        </>
      )}

      <main id="top">
        <section className={`hero${scroll ? " is-scroll" : ""}`}>
          <div className="hero-copy">
            <p className="kicker"><span className="dots" aria-hidden="true">{PAD_COLORS.slice(0, 4).map((c) => <i key={c} style={{ background: c }} />)}</span>{copy.kicker}</p>
            <h1>Your Push 2, your desk, <span className="rainbow">your rules.</span></h1>
            <p className="sub">{copy.sub}</p>
            <div className="cta">
              <a className="btn primary" href={RELEASE_LIVE ? dmgUrl(version) : "#install"}><Download />{RELEASE_LIVE ? `Download ${version}` : "Get Push Deck"}</a>
              <a className="btn ghost" href={REPO} target="_blank" rel="noopener"><GitHub />View on GitHub<External className="ext" /></a>
            </div>
          </div>

          {/* Where the device sits in the hero. On the still version it holds the device itself; on the scroll version it is an empty box the window is measured against. */}
          <div className="slot">
            {!scroll && <img className="slot-img" src={img("device-view.webp")} alt="An Ableton Push 2 running Push Deck: lit pads and the live display" width={1800} height={1284} />}
          </div>

          {scroll && <div className="scroll-cue" aria-hidden="true"><span>Scroll</span><i /></div>}
          {scroll && (
            <div className="tilt rise" style={{ transformOrigin: origin }}>
              <div className="win" style={{ transformOrigin: origin }}>
                <img className="win-ui" src={img("ui/app-ui.webp")} alt="The Push Deck window: the Claude Code profile, a replica of the Push 2 and the controls inspector" width={3200} height={2000} />
                {/* sharper close-ups that fade in over the spots the tour zooms to (they sit under the device so the live display stays on top) */}
                <div className="zl zl-select" style={rect(350, 420, 540, 520)} aria-hidden="true"><img src={img("tour/select.webp")} alt="" /></div>
                <div className="zl zl-over" style={rect(500, 520, 690, 470)} aria-hidden="true"><img src={img("tour/drag-over.webp")} alt="" /></div>
                <div className="zl zl-done" style={rect(500, 520, 690, 470)} aria-hidden="true"><img src={img("tour/drag-done.webp")} alt="" /></div>
                <div className="zl zl-p-claude" style={rect(14, 80, 276, 205)} aria-hidden="true"><img src={img("tour/prof-claude.webp")} alt="" /></div>
                <div className="zl zl-p-browser" style={rect(14, 80, 276, 205)} aria-hidden="true"><img src={img("tour/prof-browser.webp")} alt="" /></div>
                <div className="zl zl-p-codex" style={rect(14, 80, 276, 205)} aria-hidden="true"><img src={img("tour/prof-codex.webp")} alt="" /></div>
                <div className="win-device" style={{ left: `${IN_APP.left * 100}%`, top: `${IN_APP.top * 100}%`, width: `${IN_APP.width * 100}%` }}>
                  <div className={fadePads && padsOff ? "dev-fade off" : "dev-fade"}>{heroDevice}</div>
                </div>
                <div className="zl zl-ring" style={rect(496, 409, 466, 88)} aria-hidden="true" />
                <img className="zl zl-chip" style={rect(CHIP.fromX - CHIP.w / 2, CHIP.fromY - CHIP.h / 2, CHIP.w, CHIP.h)} src={img("tour/chip.webp")} alt="" aria-hidden="true" />
                <div className="win-dim" aria-hidden="true" />
                <div className="zl zl-onb-1" style={rect(300, 150, 1000, 700)} aria-hidden="true"><img src={img("tour/onb-welcome.webp")} alt="" /></div>
                <div className="zl zl-onb-2" style={rect(300, 150, 1000, 700)} aria-hidden="true"><img src={img("tour/onb-perm.webp")} alt="" /></div>
              </div>
            </div>
          )}
          {scroll && (
            <div className="app-over">
              <div className="app-grad" aria-hidden="true" />
              <div className="app-text">{appText}</div>
            </div>
          )}
          {scroll && (
            <div className="tour">
              <div className="tour-top" aria-hidden="true" /><div className="tour-edge el" aria-hidden="true" /><div className="tour-edge er" aria-hidden="true" /><div className="tour-scrim sl" aria-hidden="true" /><div className="tour-scrim sr" aria-hidden="true" />
              {tour.map((t, i) => {
                const side = TOUR[i].side === "l" ? "r" : "l";   // the text goes opposite the zoomed spot
                return (
                  <div key={t.key}>
                    <div className={`tour-glow g-${TOUR[i].side}`} style={{ ["--acc" as string]: t.accent }} aria-hidden="true" />
                    <div className={`tour-pos p-${side}`}>
                      <div className="tour-step" style={{ ["--acc" as string]: t.accent }}>
                        <p className="tag">{t.tag}</p>
                        <h2>{t.title}</h2>
                        <p className="lead">{t.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <a className="tour-skip" href="#install">Skip the tour<span aria-hidden="true"> ↓</span></a>
              <nav className="tour-rail" aria-label="Tour steps">
                {["The app", ...tour.map((t) => t.tag)].map((label, i) => (
                  <button key={label} type="button" className={i === tourIdx ? "on" : ""} onClick={() => jump.current(i)} aria-label={label} aria-current={i === tourIdx}><span>{label}</span></button>
                ))}
              </nav>
            </div>
          )}
          {scroll && <div className="hero-dim" aria-hidden="true" />}
        </section>

        {scroll && <div style={{ height: `calc(${MOVE}px + 560vh)` }} aria-hidden="true" />}

        <div className={scroll ? "after is-over" : "after"}>
        {!scroll && (
          <>
          <section className="band still-app">
            <div data-reveal>{appBlock(<div className="frame"><img src={img("ui/app-ui.webp")} alt="The Push Deck window: the Claude Code profile, a replica of the Push 2 and the controls inspector" width={3200} height={2000} loading="lazy" /></div>)}</div>
          </section>
          </>
        )}

        {!scroll && (
          <section className="band tour-still" id="tour-still" aria-label="A tour of the app">
            <TourCards />
          </section>
        )}

        {scroll ? (
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
        ) : (
          <section className="band" id="profiles">
            <p className="tag" data-reveal>Profiles</p>
            <h2 data-reveal>{copy.displayTitle}</h2>
            <ProfileCards steps={steps} />
          </section>
        )}

        <section className="band mb" id="menubar">
          <div className="desk-wrap" data-reveal>
          <div className="desk" role="img" aria-label="A Mac desktop: the Push Deck icon in the menu bar opens a small panel with tabs for the player, display and settings">
            <div className="desk-bar" aria-hidden="true">
              <span className="b-l"><b>Finder</b><i>File</i><i>Edit</i><i>View</i><i>Go</i><i>Window</i><i>Help</i></span>
              <span className="b-r">
                <svg className="b-ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a15 15 0 0 1 20 0" /><path d="M5.5 12.5a10 10 0 0 1 13 0" /><path d="M9 16a5 5 0 0 1 6 0" /><circle cx="12" cy="19.5" r="1" /></svg>
                <svg className="b-ic" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="17" height="9" rx="2.5" /><path d="M22 11v3" /></svg>
                <span className="b-pd" aria-hidden="true">{Array.from({ length: 9 }, (_, k) => <i key={k} className={[0, 2, 4, 6, 8].includes(k) ? "on" : ""} />)}</span>
                <span className="b-clock">Wed 9:41</span>
              </span>
            </div>
            <div className="desk-scrim" aria-hidden="true" />
            <div className="desk-panel" aria-hidden="true">
              <img className="pn pn-2" src={img("menubar/panel-2.webp")} alt="" loading="lazy" width={555} height={832} />
              <img className="pn pn-1" src={img("menubar/panel-1.webp")} alt="" loading="lazy" width={555} height={832} />
              <img className="pn pn-3" src={img("menubar/panel-3.webp")} alt="" loading="lazy" width={555} height={832} />
            </div>
            <svg className="desk-cursor" width="22" height="26" viewBox="0 0 22 26" aria-hidden="true"><path d="M2 1.5 2 20l5-4.4 3.4 7.6 3.2-1.4-3.3-7.4H18z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          </div>
          <div className="desk-copy">
            <p className="tag">Menu bar</p>
            <h2>Always there. Never in the way.</h2>
            <p className="lead">Push Deck lives in your menu bar. Pin a profile, switch the player, set the brightness or turn the Push on and off, without opening anything.</p>
          </div>
          </div>
        </section>

        {(scroll || isDesktop) && (   /* phones already met every feature in the tour cards */
        <section className="band recap" id="features">
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
        )}

        <section className="band" id="privacy">
          <div className="priv">
            <div>
              <p className="tag" data-reveal>Privacy</p>
              <h2 data-reveal>{copy.privacyTitle}</h2>
              <p className="lead" data-reveal>Push Deck runs on your Mac and listens on 127.0.0.1 only. No account, no cloud, no tracking: there is no Push Deck server to send anything to.</p>
            </div>
            <div className="pmap" data-reveal role="img" aria-label="Your pads and display talk to Push Deck on your Mac. Nothing goes to the cloud.">
              <div className="pm-node"><PadBlock /><b>Push 2</b></div>
              <div className="pm-link" aria-hidden="true">
                <span className="lane to">{[0, 1, 2].map((k) => <i key={k} className="pk" style={{ ["--d" as string]: `${k * 0.8}s`, ["--c" as string]: PAD_COLORS[(k * 3) % 8] }} />)}</span>
                <span className="lane from">{[0, 1].map((k) => <i key={k} className="pk" style={{ ["--d" as string]: `${0.4 + k * 1.2}s`, ["--c" as string]: "#aeb0ff" }} />)}</span>
                <span className="lbl">USB</span>
              </div>
              <div className="pm-node me"><span className="pm-mac"><Laptop /></span><b>Push Deck</b><small>127.0.0.1</small></div>
              <div className="pm-link off" aria-hidden="true"><span className="x"><Ban size={16} /></span></div>
              <div className="pm-node dim"><span className="pm-cloud"><CloudOff /></span><b>Cloud</b></div>
              <p className="pm-cap" aria-hidden="true">Nothing leaves your Mac.</p>
            </div>
          </div>
          <h3 className="priv-sub" data-reveal>Where everything lives</h3>
          <ul className="priv-grid">
            {privacyRows.map((r) => (
              <li key={r.title} data-reveal>
                <details className="pp" open={isDesktop}>
                  <summary><span className="vi" aria-hidden="true">{ICONS[r.icon]}</span><b>{r.title}</b><i className="chev" aria-hidden="true" /></summary>
                  <p>{r.text}</p>
                </details>
              </li>
            ))}
          </ul>
          <p className="fine" data-reveal>* {claudeNote}</p>
        </section>

        <section className="band" id="install">
          <p className="tag" data-reveal>Install</p>
          <h2 data-reveal>{copy.installTitle}</h2>
          <div className="installs">
            {install.map((r, i) => {
              const live = RELEASE_LIVE;
              return (
                <article key={r.id} data-reveal style={{ ["--c" as string]: PAD_COLORS[i * 2] }}>
                  <header>
                    <span className="ico" aria-hidden="true">{Array.from({ length: 4 }, (_, k) => <i key={k} className={k === i % 4 || k === (i + 2) % 4 ? "on" : ""} />)}</span>
                    <h3>{r.label}</h3>
                    {!live && <em className="soon">Coming with the first release</em>}
                  </header>
                  {r.id === "dmg"
                    ? <a className={`btn primary${live ? "" : " muted"}`} href={live ? dmgUrl(version) : `${REPO}/releases`} {...(live ? { download: "" } : { target: "_blank", rel: "noopener" })}>{live ? <><Download />Download {version} (.dmg)</> : <>Watch releases<External className="ext" /></>}</a>
                    : <CopyCmd cmd={r.cmd} live={live} />}
                  <p>{r.note}</p>
                </article>
              );
            })}
          </div>
          <p className="fine" data-reveal>* {installNote}</p>
          <ul className="req" data-reveal>{requirements.map((r) => <li key={r}>{r}</li>)}</ul>
        </section>

        <section className="band" id="faq">
          <p className="tag" data-reveal>FAQ</p>
          <h2 data-reveal>Frequently asked questions</h2>
          <div className="faq" data-reveal>
            {faq.map((f, i) => (
              <details key={f.q} open={i === 0}><summary>{f.q}</summary><p>{f.a}</p></details>
            ))}
          </div>
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

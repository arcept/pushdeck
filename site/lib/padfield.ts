/// <reference types="@webgpu/types" />
// The lit pads, drawn on a canvas laid over the device picture.
// WebGPU when the browser has it (a shader draws flat silicone faces with the LED glowing through, a dip when pressed and a little light spilling onto the body);
// a plain 2D canvas otherwise. A small simulation plays the pads like someone is using the Push, and answers the pointer.

export type Geometry = { grid0: [number, number]; pitch: [number, number]; pad: [number, number]; radius: number; margin: number; size: [number, number]; spill: [number, number]; dark?: boolean };   // spill: [reach in pitches, strength]; dark: the dim hero deck, where unlit pads are drawn too (as raised rubber) instead of showing the picture's

const SHADER = /* wgsl */ `
struct U { res: vec2f, grid0: vec2f, pitch: vec2f, pad: vec2f, radius: f32, dark: f32, glowR: f32, spare: f32 };   // spare: glow strength
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> pads: array<vec4f, 128>;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn sdBox(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = fc.xy;
  let cell = clamp(floor((p - u.grid0) / u.pitch), vec2f(0.0), vec2f(7.0));   // outside the grid, the edge pads still light the body
  var surf = vec3f(0.0);
  var a = 0.0;
  var glow = vec3f(0.0);
  var onPad = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let c = cell + vec2f(f32(dx), f32(dy));
      if (c.x < 0.0 || c.y < 0.0 || c.x > 7.0 || c.y > 7.0) { continue; }
      let i = u32(c.y) * 8u + u32(c.x);
      let pd = pads[i];
      let pr = pads[64u + i].x;
      let lit = pd.w;
      let half = u.pad * 0.5;   // capacitive pads: they never move or change shape when hit, they only light up
      let lp = p - (u.grid0 + c * u.pitch + u.pad * 0.5);
      let d = sdBox(lp, half, u.radius);
      // a little light spills out around the pad
      glow += pd.rgb * lit * lit * exp(-max(d, 0.0) / u.glowR) * u.spare * step(0.0, d);   // spare = spill strength
      if (d < 0.0) {
        onPad = 1.0;
        // a flat silicone face with the LED glowing through: a richer colour, a soft brighter middle and a tiny hot core
        let uvc = lp / u.pad;
        let hot = exp(-dot(uvc, uvc) * 3.0);
        let core = exp(-dot(uvc, uvc) * 16.0);
        let gry = dot(pd.rgb, vec3f(0.3, 0.59, 0.11));
        let rich = clamp(mix(vec3f(gry), pd.rgb, 1.45), vec3f(0.0), vec3f(1.0));
        let emit = rich * (0.8 + 0.22 * hot) * (0.6 + 0.5 * lit) * (1.0 - 0.12 * pr) + (rich * 0.3 + vec3f(0.05)) * core * lit;
        // unlit: the picture's own pad, or on the dim deck a rubber top drawn here
        var rubber = vec3f(0.6, 0.61, 0.63);
        if (u.dark > 0.5) { rubber = mix(vec3f(0.265, 0.27, 0.285), vec3f(0.17, 0.175, 0.19), c.y / 7.0); }
        surf = mix(rubber, emit, smoothstep(0.03, 0.4, lit));
        a = smoothstep(0.0, 1.2, -d) * clamp(lit * 2.4, 0.0, 1.0);
        if (u.dark > 0.5) {
          a = smoothstep(0.0, 1.2, -d);
          // raised, not engraved: the top and left edges catch the light, the bottom and right fall away
          let q = abs(lp) / half;
          var n = vec2f(0.0, sign(lp.y));
          if (q.x > q.y) { n = vec2f(sign(lp.x), 0.0); }
          let rim = 1.0 - smoothstep(0.0, u.pad.y * 0.07, -d);
          surf *= 1.0 + rim * dot(n, vec2f(-0.45, -0.9)) * mix(0.55, 0.25, smoothstep(0.03, 0.4, lit));
        }
      }
    }
  }
  glow *= 1.0 - 0.8 * onPad;   // spill lights the body between pads, not the faces of dark pads
  let ga = clamp(max(glow.r, max(glow.g, glow.b)), 0.0, 1.0);
  return vec4f(surf * a + glow * (1.0 - a), max(a, ga));
}
`;

type Ripple = { r: number; c: number; t0: number; amp: number };

export class PadField {
  private canvas: HTMLCanvasElement;
  private geo: Geometry;
  private colors = new Float32Array(64 * 3);
  private target = new Float32Array(64 * 3);
  private base = new Float32Array(64);
  private level = new Float32Array(64);
  private press = new Float32Array(64);
  private ripples: Ripple[] = [];
  private hover = -1;
  private data = new Float32Array(128 * 4);
  private t = 0;
  private nextHit = 0.6;
  private raf = 0;
  private last = 0;
  private visible = true;
  private gpu?: { device: GPUDevice; ctx: GPUCanvasContext; pipe: GPURenderPipeline; ubuf: GPUBuffer; sbuf: GPUBuffer; bind: GPUBindGroup };
  private ctx2d?: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private io?: IntersectionObserver;
  private dead = false;
  autoplay: boolean;
  /** stop drawing (e.g. while the layer is faded out) */
  paused = false;
  still: boolean;
  /** "webgpu" or "2d", once started */
  mode: "webgpu" | "2d" | "" = "";

  constructor(canvas: HTMLCanvasElement, geo: Geometry, opts: { autoplay: boolean; still: boolean }) {
    this.canvas = canvas; this.geo = geo; this.autoplay = opts.autoplay; this.still = opts.still;
  }

  /** colours as [r,g,b] 0..1 per pad, and how bright each pad rests (0..1) */
  setPads(colors: [number, number, number][], base: number[], instant = false) {
    colors.forEach((c, i) => { this.target.set(c, i * 3); if (instant) this.colors.set(c, i * 3); });
    base.forEach((b, i) => { this.base[i] = b; if (instant) this.level[i] = b; });
    if (this.still) this.draw();
  }

  /** a pad gets hit: it dents and a ring of light runs out from it */
  hit(r: number, c: number, amp = 1) {
    if (r < 0 || c < 0 || r > 7 || c > 7) return;
    this.press[r * 8 + c] = Math.max(this.press[r * 8 + c], amp);
    this.ripples.push({ r, c, t0: this.t, amp });
    if (this.ripples.length > 12) this.ripples.shift();
  }

  /** the pad under the pointer lights fully while it stays there (-1: none) */
  setHover(i: number) { this.hover = i; if (this.still) { for (let n = 0; n < 64; n++) this.level[n] = n === i ? 1 : this.base[n]; this.draw(); } }

  /** pointer position in canvas CSS pixels -> the pad under it, or null */
  padAt(x: number, y: number): [number, number] | null {
    const k = this.canvas.clientWidth / this.geo.size[0];
    const gx = (x / k - this.geo.margin) / this.geo.pitch[0], gy = (y / k - this.geo.margin) / this.geo.pitch[1];
    const c = Math.floor(gx), r = Math.floor(gy);
    if (r < 0 || c < 0 || r > 7 || c > 7) return null;
    if (gx - c > this.geo.pad[0] / this.geo.pitch[0] || gy - r > this.geo.pad[1] / this.geo.pitch[1]) return null; // in the gap
    return [r, c];
  }

  async start() {
    try { await this.initGPU(); this.mode = "webgpu"; } catch { this.ctx2d = this.canvas.getContext("2d") ?? undefined; this.mode = "2d"; }
    if (this.dead) return;
    this.resize();
    this.ro = new ResizeObserver(() => { this.resize(); if (this.still) this.draw(); });
    this.ro.observe(this.canvas);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; });
    this.io.observe(this.canvas);
    if (this.still) { this.draw(); return; }
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      if (!this.visible || this.paused) return;
      this.step(dt); this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.io?.disconnect();
    this.gpu?.ubuf.destroy(); this.gpu?.sbuf.destroy(); this.gpu?.device.destroy();
  }

  private async initGPU() {
    if (!("gpu" in navigator)) throw new Error("no webgpu");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
    if (!adapter) throw new Error("no adapter");
    const device = await adapter.requestDevice();
    const ctx = this.canvas.getContext("webgpu");
    if (!ctx) throw new Error("no context");
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "premultiplied" });
    const module = device.createShaderModule({ code: SHADER });
    const pipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    const ubuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const sbuf = device.createBuffer({ size: this.data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const bind = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: { buffer: sbuf } }] });
    this.gpu = { device, ctx, pipe, ubuf, sbuf, bind };
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  private step(dt: number) {
    this.t += dt;
    // someone is playing: every so often a pad gets hit
    if (this.autoplay && this.t > this.nextHit) {
      this.hit(Math.floor(Math.random() * 8), Math.floor(Math.random() * 8), 0.45 + Math.random() * 0.35);
      this.nextHit = this.t + 0.45 + Math.random() * 0.9;
    }
    const fade = Math.exp(-dt * 5);
    const ease = 1 - Math.exp(-dt * 4);
    for (let i = 0; i < 64; i++) {
      this.press[i] *= fade;
      for (let k = 0; k < 3; k++) this.colors[i * 3 + k] += (this.target[i * 3 + k] - this.colors[i * 3 + k]) * ease;
    }
    this.ripples = this.ripples.filter((rp) => this.t - rp.t0 < 2.5);
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8), c = i % 8;
      let boost = 0;
      for (const rp of this.ripples) {
        const age = this.t - rp.t0, dist = Math.hypot(r - rp.r, c - rp.c), front = dist - age * 9;
        boost = Math.max(boost, rp.amp * (dist < 0.5 ? 1 : 0.5) * Math.exp(-(front * front) / 0.5) * Math.exp(-age * 1.8));   // the hit pad flashes; the ring is thinner and fainter
      }
      const want = i === this.hover ? 1 : Math.min(1, this.base[i] + boost * 0.85);
      this.level[i] += (want - this.level[i]) * (want > this.level[i] ? 0.6 : 1 - Math.exp(-dt * 3));
    }
  }

  private draw() {
    const { width: w, height: h } = this.canvas;
    const k = w / this.geo.size[0];
    for (let i = 0; i < 64; i++) {
      this.data[i * 4] = this.colors[i * 3]; this.data[i * 4 + 1] = this.colors[i * 3 + 1]; this.data[i * 4 + 2] = this.colors[i * 3 + 2];
      this.data[i * 4 + 3] = this.level[i];
      this.data[(64 + i) * 4] = this.press[i];
    }
    const g = this.geo;
    if (this.gpu) {
      const { device, ctx, pipe, ubuf, sbuf, bind } = this.gpu;
      device.queue.writeBuffer(ubuf, 0, new Float32Array([
        w, h, g.margin * k, g.margin * k, g.pitch[0] * k, g.pitch[1] * k, g.pad[0] * k, g.pad[1] * k, g.radius * k, g.dark ? 1 : 0, g.pitch[0] * k * g.spill[0], g.spill[1],
      ]));
      device.queue.writeBuffer(sbuf, 0, this.data);
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
      pass.setPipeline(pipe); pass.setBindGroup(0, bind); pass.draw(3); pass.end();
      device.queue.submit([enc.finish()]);
      return;
    }
    const c = this.ctx2d; if (!c) return;
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 64; i++) {
      const lit = this.level[i]; if (lit < 0.04) continue;
      const r = Math.floor(i / 8), col = i % 8, pr = this.press[i];
      const s = 1;
      const pw = g.pad[0] * k * s, ph = g.pad[1] * k * s;
      const x = (g.margin + col * g.pitch[0]) * k + (g.pad[0] * k - pw) / 2, y = (g.margin + r * g.pitch[1]) * k + (g.pad[1] * k - ph) / 2;
      const rgb = `${Math.round(this.colors[i * 3] * 255)},${Math.round(this.colors[i * 3 + 1] * 255)},${Math.round(this.colors[i * 3 + 2] * 255)}`;
      c.globalAlpha = Math.min(1, lit * 2.4);
      c.shadowColor = `rgba(${rgb},${0.35 * lit})`; c.shadowBlur = g.pitch[0] * k * 0.12 * lit;
      c.fillStyle = `rgb(${rgb})`;
      c.beginPath(); c.roundRect(x, y, pw, ph, g.radius * k); c.fill();
      c.shadowBlur = 0;
    }
    c.globalAlpha = 1;
  }
}

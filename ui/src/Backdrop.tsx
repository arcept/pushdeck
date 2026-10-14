import { useEffect, useRef } from "react";
import { isActive } from "./activity";

// The light the Push sits in: a WebGL backdrop with film grain, a soft key light behind the replica, slow drifting haze
// (ambient) and, in reactive mode, light that blooms out from whatever you press or turn, in that control's colour.

export type Look = "showpiece" | "simple" | "instrument";
export type Tone = "warm" | "graphite";
export type FxMode = "reactive" | "ambient" | "off";
type Pulse = { x: number; y: number; t: number; s: number; c: [number, number, number] };

const listeners = new Set<(p: Omit<Pulse, "t">) => void>();
export const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt((h || "#ffffff").replace("#", "").padEnd(6, "f").slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
// Send light from a point on screen (CSS px). strength ~0.3 (knob tick) to ~1.2 (profile change).
export function pulse(x: number, y: number, color: string, strength = 0.7) { listeners.forEach((l) => l({ x, y, s: strength, c: hexRgb(color) })); }
export function pulseAt(el: Element | null, color: string, strength = 0.7) {
  if (!el) return; const r = el.getBoundingClientRect(); pulse(r.left + r.width / 2, r.top + r.height / 2, color, strength);
}

const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FRAG = `precision highp float;
uniform vec2 uRes;uniform float uTime;uniform float uLook;uniform float uMotion;uniform vec3 uAccent;uniform vec4 uStage;
uniform vec4 uP[8];uniform vec3 uC[8];uniform vec3 uBase;uniform vec3 uKey;
float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*n2(p);p*=2.03;a*=.5;}return s;}
void main(){
 vec2 px=gl_FragCoord.xy;
 vec2 c=uStage.xy+uStage.zw*.5;
 vec2 d=(px-c)/max(uStage.z,1.)*vec2(1.,1.2);
 float r=length(d);
 float t=uTime*uMotion;
 vec3 base=uBase;
 float drift=fbm(px/mix(560.,400.,uLook)+vec2(t*.016,-t*.011));
 float haze=(drift-.5);
 float pool=exp(-r*r*mix(2.8,1.6,uLook))*mix(.045,.10,uLook);
 vec3 poolCol=uKey;
 vec3 col=base+poolCol*pool*(1.+haze*mix(.6,1.1,uLook))+haze*mix(.010,.022,uLook);
 col+=uAccent*mix(.004,.018,uLook)*exp(-r*r*1.4);
 for(int i=0;i<8;i++){
  vec4 P=uP[i];float age=uTime-P.z;
  if(P.w>0.&&age>=0.&&age<3.2){
   float dist=length(px-P.xy);
   float rad=age*mix(240.,330.,uLook);
   float ring=exp(-pow((dist-rad)/mix(24.,42.,uLook),2.));
   float glow=exp(-dist/mix(120.,210.,uLook));
   col+=uC[i]*(ring*.075+glow*.055)*exp(-age*1.7)*P.w;
  }
 }
 vec2 uv=px/uRes;col*=mix(.72,1.,smoothstep(1.25,.3,length((uv-.5)*vec2(1.25,1.))));
 float g=h21(mod(floor(px),1024.)+floor(fract(t*7.13)*64.)*vec2(17.,29.))-.5;
 col+=g*mix(.020,.030,uLook);
 gl_FragColor=vec4(col,1.);
}`;

// Colour tones (every look): the room's ground colour and the colour of the key light behind the device.
const TONES: Record<Tone, { base: number[]; key: number[] }> = {
  warm: { base: [0.030, 0.028, 0.033], key: [1.0, 0.92, 0.84] },
  graphite: { base: [0.029, 0.031, 0.034], key: [0.86, 0.90, 0.96] },
};

export default function Backdrop({ look, mode, accent, tone }: { look: Look; mode: FxMode; accent: string; tone: Tone }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const opts = useRef({ look, mode, accent, tone });
  opts.current = { look, mode, accent, tone };

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const gl = cv.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    if (!gl) { cv.classList.add("nogl"); return; }
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const U = { res: u("uRes"), time: u("uTime"), look: u("uLook"), motion: u("uMotion"), accent: u("uAccent"), stage: u("uStage"), p: u("uP"), c: u("uC"), base: u("uBase"), key: u("uKey") };

    const pulses: Pulse[] = [];
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;
    const onPulse = (p: Omit<Pulse, "t">) => { if (opts.current.mode !== "reactive") return; pulses.push({ ...p, t: now() }); if (pulses.length > 8) pulses.shift(); };
    listeners.add(onPulse);

    let raf = 0, last = 0, lookMix = opts.current.look === "showpiece" ? 1 : 0;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      const { mode: m, look: lk, accent: ac, tone: tn } = opts.current;
      if (!isActive()) return;   // nothing is drawn while the window is hidden or in the background
      const moving = m !== "off" && !reduce;
      if (ms - last < (moving ? 33 : 250)) return; // ~30 fps while moving, a few redraws a second when still
      last = ms;
      const w = innerWidth, h = innerHeight;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
      lookMix += ((lk === "showpiece" ? 1 : 0) - lookMix) * 0.12;
      const st = document.querySelector(".stagecol")?.getBoundingClientRect();
      const t = now();
      gl.uniform2f(U.res, w, h); gl.uniform1f(U.time, t); gl.uniform1f(U.look, lookMix); gl.uniform1f(U.motion, moving ? 1 : 0);
      gl.uniform3fv(U.accent, hexRgb(ac));
      const T = TONES[tn] ?? TONES.warm; gl.uniform3fv(U.base, T.base); gl.uniform3fv(U.key, T.key);
      gl.uniform4f(U.stage, st ? st.left : w / 2, st ? h - st.bottom : h / 2, st ? st.width : w / 2, st ? st.height : h / 2);
      const P = new Float32Array(32), C = new Float32Array(24);
      pulses.forEach((p, i) => { P.set([p.x, h - p.y, p.t, p.s], i * 4); C.set(p.c, i * 3); });
      gl.uniform4fv(U.p, P); gl.uniform3fv(U.c, C);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); listeners.delete(onPulse); };
  }, []);

  return <canvas ref={ref} className="backdrop" aria-hidden="true" />;
}

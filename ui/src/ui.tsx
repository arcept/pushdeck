import { usePop } from "./motion";
import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)}>
      <span className="track"><span className="thumb" /></span>{label}
    </button>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; icon?: IconName }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <div className="field"><span className="lab">{label}</span>{children}{hint && <span className="hint">{hint}</span>}</div>;
}

// A dropdown that opens under its trigger but is drawn on the page itself (fixed, in <body>), so a scrolling or clipping column can't cut it off.
export function AnchoredPopover({ trigger, children, width = 300 }: { trigger: (o: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; width?: number }) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number; w: number } | null>(null);
  const anchor = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const place = useCallback(() => {
    const r = anchor.current?.getBoundingClientRect(); if (!r) return;
    const w = Math.min(Math.max(width, r.width), innerWidth - 24);
    setBox({ left: Math.max(12, Math.min(r.left, innerWidth - w - 12)), top: r.bottom + 8, w });
  }, [width]);
  useEffect(() => {
    if (!open) return;
    place();
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!anchor.current?.contains(t) && !panel.current?.contains(t)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key); window.addEventListener("resize", place);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); window.removeEventListener("resize", place); };
  }, [open, place]);
  return (
    <div className="anchorwrap" ref={anchor}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && box && createPortal(<><div className="scrim" aria-hidden="true" /><div ref={panel} className="anchorpop" style={{ left: box.left, top: box.top, width: box.w }}><PopPanel className="pop inpop">{children(() => setOpen(false))}</PopPanel></div></>, document.body)}
    </div>
  );
}

// A small dropdown surface that closes on outside click or Escape.
function PopPanel({ className, children }: { className: string; children: ReactNode }) {
  const r = useRef<HTMLDivElement>(null); usePop(r, { y: -6 });
  return <div ref={r} className={className}>{children}</div>;
}
export function Popover({ trigger, children, align = "left" }: { trigger: (o: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div className="popwrap" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && <PopPanel className={`pop ${align === "right" ? "right" : ""}`}>{children(() => setOpen(false))}</PopPanel>}
    </div>
  );
}

// Text that changes with state without changing the layout: every variant is laid out in the same cell, only one is visible.
export function Stable({ items, active }: { items: ReactNode[]; active: number }) {
  return <span className="stable">{items.map((n, i) => <span key={i} aria-hidden={i !== active} style={{ visibility: i === active ? "visible" : "hidden" }}>{n}</span>)}</span>;
}

// Our own hover explanation for toolbar items (replaces native title attributes so nothing doubles up).
export function Tip({ title, desc, children, align = "center" }: { title: string; desc?: string; children: ReactNode; align?: "left" | "center" | "right" }) {
  return (
    <span className="tt">{children}
      <span className={`ttb ${align}`} role="tooltip"><b>{title}</b>{desc && <span>{desc}</span>}</span>
    </span>
  );
}

// A two-step destructive button: first click arms it for 3 s, second confirms.
export function ConfirmButton({ label, armedLabel, onConfirm, icon, disabled, className = "" }: { label: string; armedLabel: string; onConfirm: () => void; icon?: IconName; disabled?: boolean; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = window.setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return (
    <button type="button" className={`btn danger ${armed ? "armed" : ""} ${className}`} disabled={disabled}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {icon && <Icon name={icon} size={16} />}<Stable items={[label, armedLabel]} active={armed ? 1 : 0} />
    </button>
  );
}

// ---- toasts ----
type ToastItem = { id: number; text: string; kind: "good" | "bad" | "info" };
const ToastCtx = createContext<(text: string, kind?: ToastItem["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
function Toast({ kind, children }: { kind: string; children: ReactNode }) {
  const r = useRef<HTMLDivElement>(null); usePop(r, { x: 30, y: 0 });
  return <div ref={r} className={`toast ${kind}`}>{children}</div>;
}
export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: ToastItem["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l.slice(-3), { id, text, kind }]);
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <Toast key={t.id} kind={t.kind}><Icon name={t.kind === "bad" ? "alert" : t.kind === "good" ? "check" : "info"} size={16} />{t.text}</Toast>)}
      </div>
    </ToastCtx.Provider>
  );
}

// A text box that keeps its own text while it has focus, so nothing that arrives from outside while you type (a save coming back, a re-render) can move the caret or
// swap the text under you; it takes the outside value again when you leave it. Spell-check and auto-correct are off: these fields hold names, commands and app names.
type TextProps = { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;
export function TextField({ value, onChange, onFocus, onBlur, ...rest }: TextProps) {
  const [v, setV] = useState(value); const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(value); }, [value]);
  return <input type="text" {...rest} value={v} spellCheck={false} autoCorrect="off" autoCapitalize="off" autoComplete="off"
    onFocus={(e) => { focused.current = true; onFocus?.(e); }} onBlur={(e) => { focused.current = false; setV(value); onBlur?.(e); }}
    onChange={(e) => { setV(e.target.value); onChange(e.target.value); }} />;
}
export function TextArea({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const [v, setV] = useState(value); const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(value); }, [value]);
  return <textarea {...rest} value={v} spellCheck={false} autoCorrect="off" autoCapitalize="off"
    onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setV(value); }} onChange={(e) => { setV(e.target.value); onChange(e.target.value); }} />;
}

// Native <dialog> wrapper: focus trap, Escape and backdrop click for free.
export function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback(() => { ref.current?.showModal(); setOpen(true); }, []);
  const close = useCallback(() => { ref.current?.close(); }, []);
  useEffect(() => { const d = ref.current; if (!d) return; const h = () => setOpen(false); d.addEventListener("close", h); return () => d.removeEventListener("close", h); }, []);
  return { ref, open, show, close };
}

// The last swatch: a spectrum chip that opens the system colour picker. Shows the chosen colour once one is set.
export function CustomColour({ value, active, onChange }: { value: string; active: boolean; onChange: (v: string) => void }) {
  return (
    <label className={`swatch custom ${active ? "on" : ""}`} title="Custom colour" aria-pressed={active}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom colour" />
      {active && <span className="customfill" style={{ background: value }} />}
    </label>);
}

import { useState } from "react";
import { Icon } from "./icons";
import { useApp } from "./ctx";
import { ACTION_KINDS, MEDIA_ACTIONS, WINDOW_ADDABLE, controlKind, summarize } from "./model";
import { useToast } from "./ui";

// While a chip is dragged, every pad or button that can take an action is outlined on the replica and the one under the pointer lights up.
function markTargets(on: boolean, ok: (id: string) => boolean) {
  const root = document.querySelector(".replica");
  root?.querySelectorAll<SVGGElement>("g.control").forEach((g) => { g.classList.toggle("drop-target", on && ok(g.id)); if (!on) g.classList.remove("drop-hover"); });
  document.body.toggleAttribute("data-dragging", on);
}
const over = (e: DragEvent) => {
  const g = (e.target as Element | null)?.closest?.("g.control.drop-target");
  document.querySelectorAll(".replica .drop-hover").forEach((x) => x !== g && x.classList.remove("drop-hover"));
  g?.classList.add("drop-hover");
};

// Things to put on a pad or button: drag a chip onto the replica, or select a control first and click a chip.
export default function ActionLibrary() {
  const { d, profile, selected, setSelected, updateControl } = useApp();
  const [open, setOpen] = useState(false);   // always folded to start with: the editor above it gets the room
  const toast = useToast();
  const ok = (id: string) => controlKind(id, d.settings, d.controls[id]?.kind, profile) === "editable";
  const drag = (a: object) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", JSON.stringify(a)); e.dataTransfer.effectAllowed = "copy";
    markTargets(true, ok); document.addEventListener("dragover", over);
  };
  const end = () => { markTargets(false, ok); document.removeEventListener("dragover", over); };
  const apply = (a: Record<string, unknown>) => {
    if (!profile || !selected || !ok(selected)) { toast("Select a pad or button on the Push picture first, or drag this chip onto one.", "info"); return; }
    updateControl(selected, { ...(profile.controls[selected] ?? {}), action: a as never });
    setSelected(selected);
    toast(`${d.controls[selected]?.name ?? selected}: ${summarize(a as never) || "action added"}`, "good");
  };
  const chip = (key: string, icon: Parameters<typeof Icon>[0]["name"], label: string, a: Record<string, unknown>) => (
    <span key={key} className="achip" role="button" tabIndex={0} draggable onDragStart={drag(a)} onDragEnd={end}
      onClick={() => apply(a)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apply(a); } }}>
      <span className="grip" aria-hidden="true" /><Icon name={icon} size={15} />{label}
    </span>);
  return (
    <section className="actionlib" aria-label="Add an action">
      <button className="alhead" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Add an action<span className="alsub">drag onto the Push, or click</span></span><Icon name={open ? "down" : "right"} size={14} />
      </button>
      {open && <div className="alchips">
        {ACTION_KINDS.filter((k) => k.type !== "media" && k.type !== "window").map((k) => chip(k.type, k.icon, k.label, { type: k.type, [k.field]: "" }))}
        {MEDIA_ACTIONS.map(([v, l]) => chip(v, "media", l, { type: "media", name: v }))}
        {WINDOW_ADDABLE.map(([v, l]) => chip(`win-${v}`, v === "close" ? "x" : v === "minimize" ? "down" : "grid", l, { type: "window", op: v }))}
      </div>}
    </section>
  );
}

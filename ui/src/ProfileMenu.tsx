import { Icon } from "./icons";
import { useApp } from "./ctx";
import { useState } from "react";
import { useLibrary } from "./useLibrary";
import ProfileIcon from "./ProfileIcon";
import { sceneIndex, sceneName } from "./model";

// The profile switcher, opened from the profile name in the left column: picking a profile puts it on the Push (locked) and opens it for editing.
export default function ProfileMenu({ close }: { close: () => void }) {
  const { d, profile, held, followPush, setCurrent } = useApp();
  const { create, importFile, file } = useLibrary();
  const [q, setQ] = useState("");
  const pinned = !!d.active.pinned && d.profiles.some((p) => p.id === d.active.pinned);
  const list = d.profiles.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.match.bundle_ids.some((b) => b.toLowerCase().includes(q.toLowerCase())));
  const pick = (id: string) => { setCurrent(id); close(); };
  return (
    <div className="pmenu">
      <div className="pm-search"><Icon name="search" size={15} /><input type="search" autoFocus placeholder="Search profiles or apps" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search profiles" /></div>
      <div role="listbox" aria-label="Profile to edit" className="pm-list">
        {!q && <button className="popitem" role="option" aria-selected={!held} onClick={() => { followPush(); close(); }}>
          <span className="sw" style={{ width: 12, height: 12, borderRadius: 4, background: "var(--tx3)" }} />Follow the Push<span className="popsub">shows the live profile</span></button>}
        {list.map((p) => (
          <button key={p.id} className="popitem" role="option" aria-selected={held && profile?.id === p.id} onClick={() => pick(p.id)}>
            <ProfileIcon profile={p} size={20} />{p.name}
            {d.active.active === p.id ? <span className="chipbadge accent" style={{ marginLeft: "auto" }}>{pinned ? "master" : "auto"}</span> : p.slot !== undefined && p.slot < 8 ? <span className="popsub">{sceneName(Math.max(0, sceneIndex(d.profiles, p.id)))}</span> : null}
          </button>))}
        {!list.length && <div className="empty">{d.profiles.length ? `No profile matches “${q}”.` : "No profiles yet."}</div>}
      </div>
      <div className="pm-foot">
        <button className="btn sm" onClick={() => { create(); close(); }}><Icon name="plus" size={14} />New profile</button>
        <button className="btn sm ghost" onClick={() => file.current?.click()}><Icon name="upload" size={14} />Import</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; close(); }} />
      </div>
    </div>
  );
}


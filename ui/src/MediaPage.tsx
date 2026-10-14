import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { Icon } from "./icons";
import { Field, Seg, Switch } from "./ui";
import type { MediaConfig } from "./daemon";

const DEFAULTS: MediaConfig = { mode: "half", idle: "last", chrome: true, spotify_desktop: true, system: true, auto_show: true };
const REDIRECT = "http://127.0.0.1:8472/spotify/callback";
const badge = (cls: string, text: string) => <span className={`chipbadge ${cls}`}>{text}</span>;

// Settings → Media: the Push player, the players it can follow, and the Spotify sign-in.
export default function MediaPage() {
  const { d } = useApp();
  const m = d.media, cfg: MediaConfig = { ...DEFAULTS, ...((d.settings as { media?: Partial<MediaConfig> } | null)?.media ?? {}) };
  const set = (config: Partial<MediaConfig>) => d.send({ type: "media_config", config });
  const sp = m?.spotify, t = m?.track;
  const [cid, setCid] = useState(sp?.client_id ?? "");
  useEffect(() => { setCid(sp?.client_id ?? ""); }, [sp?.client_id]);
  const cmd = (op: string) => d.send({ type: "media_cmd", op });
  const [copied, setCopied] = useState(false);
  return (<>
    <h2>Media</h2><p className="lead">See what's playing on the Push and control it from the buttons. It works in every profile.</p>

    <section className="setgroup"><h3>Media player on the Push</h3>
      <Field label="Show the media player" hint={<>The Layout button on the Push shows and hides the large media player over one half of the display; choose the half in the Widgets tab beside the Push.</>}>
        <Seg label="Player" value={cfg.mode} onChange={(v) => set({ mode: v })} options={[{ value: "off", label: "Hidden" }, { value: "half", label: "Shown" }]} /></Field>
      <div className="trow"><div><div className="t">Slide in when music starts</div><div className="d">Brings the player in by itself whenever something starts playing. Hide it any time with the Layout button; it stays hidden until the next time music starts.</div></div>
        <Switch checked={cfg.auto_show} onChange={(v) => set({ auto_show: v })} label={<span className="sr">Slide in when music starts</span>} /></div>
      <Field label="When nothing is playing"><Seg label="When nothing is playing" value={cfg.idle} onChange={(v) => set({ idle: v })} options={[{ value: "last", label: "Last track" }, { value: "empty", label: "Nothing playing" }]} /></Field>
      <p className="muted">The player's buttons sit above and below it: on the large player Play, Previous, Next and Save below, Shuffle, Repeat and Browse above; on the compact one Previous and Next above, Play and Save below. The Play button and the left and right arrows work as play, previous and next, and the touch strip seeks. A profile's own action on those buttons always wins.</p>
    </section>

    <section className="setgroup"><h3>Players</h3>
      <div className="trow"><div><div className="t">Spotify app</div><div className="d">Reads the track and controls it. Needs no sign-in.</div></div>
        <Switch checked={cfg.spotify_desktop} onChange={(v) => set({ spotify_desktop: v })} label={<span className="sr">Spotify app</span>} /></div>
      <div className="trow"><div><div className="t">YouTube Music and web players in Chrome</div>
        <div className="d">{m?.chrome.state === "needs_js" ? <>Chrome needs one setting first: <b>View → Developer → Allow JavaScript from Apple Events</b>. Until then only the page title is readable. Works for the YouTube Music app too.</> : "Reads the title, artist and artwork from the page, and controls it."}</div></div>
        <div className="row">{m?.chrome.state === "needs_js" && badge("warn", "Needs one setting")}<Switch checked={cfg.chrome} onChange={(v) => set({ chrome: v })} label={<span className="sr">Chrome players</span>} /></div></div>
      <div className="trow"><div><div className="t">Any other media on this Mac</div>
        <div className="d">Also shows whatever macOS lists as playing (a video in a Chrome tab, Music, VLC) and controls it like your keyboard's media keys.</div></div>
        <div className="row"><Switch checked={cfg.system} onChange={(v) => set({ system: v })} label={<span className="sr">Other media</span>} /></div></div>
    </section>

    <section className="setgroup"><h3>Spotify, optional</h3>
      <p className="muted" style={{ marginTop: 0 }}>Signing in to Spotify adds extra controls. You can skip it: Spotify still plays, pauses and skips like any other player.</p>
      <div className="spcols">
        <div className="spcard"><b>With Spotify connected</b>
          <ul><li>Save the song to your Liked Songs with the Save button on the Push</li><li>See what's up next</li><li>Control Spotify when it plays on another device, like a phone or speaker (needs Spotify Premium)</li></ul></div>
        <div className="spcard"><b>Without it</b>
          <ul><li>Artwork, title, progress, play, pause, next, previous, shuffle, repeat and seek still work through the Spotify app on this Mac</li><li>The Save button stays blank</li><li>Spotify Premium makes no difference here</li></ul></div>
      </div>
      <div className="spcard spsafe"><b>Private by design</b>
        <p>You sign in on Spotify's own page, so this app never sees your password. There is no shared account and no secret to store: you make your own free Spotify app and paste its public Client ID. The sign-in token stays in one file on this Mac and is only ever sent to Spotify. Nothing is synced or uploaded anywhere. Disconnect deletes it.</p></div>
      <div className="spprev" aria-hidden="true"><div className="spscreen">
        <div className="spzones">{["Prev", "Pause", "Next", "Saved", "Shuffle", "Repeat", "", "Full"].map((z, i) => <span key={i} className={i === 3 ? "on" : ""}>{z}</span>)}</div>
        <div className="sptoast">Saved to Liked Songs</div></div>
        <p>What you'll see: press Save on the Push and the song joins your Liked Songs. The button lights up pink.</p></div>
      <h4 className="spsub">How to connect</h4>
      <ol className="steps msteps">
        <li>Open the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify developer dashboard</a>, sign in, and choose <b>Create app</b>. Any name works, for example Push Deck.</li>
        <li>Set the redirect URI to <code>{REDIRECT}</code> <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(REDIRECT); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Icon name={copied ? "check" : "copy"} size={13} />{copied ? "Copied" : "Copy"}</button> and tick <b>Web API</b>. Save.</li>
        <li>Open the app's settings, copy the <b>Client ID</b>, and paste it below. It isn't a password.</li>
        <li>Press <b>Connect Spotify</b>. A tab opens on Spotify, you choose Agree, and the tab tells you it's connected. Come back here.</li>
      </ol>
      <Field label="Client ID"><div className="row"><input type="text" className="mono" style={{ flex: 1, minWidth: 0 }} value={cid} placeholder="Paste your Client ID" onChange={(e) => setCid(e.target.value)} spellCheck={false} />
        <button className="btn" disabled={cid.trim() === (sp?.client_id ?? "")} onClick={() => d.send({ type: "spotify", op: "client_id", value: cid })}>Save</button></div></Field>
      <div className="row wrap">
        {sp?.connected ? <>{badge("good", `Connected${sp.user ? " as " + sp.user : ""}`)}<button className="btn" onClick={() => d.send({ type: "spotify", op: "disconnect" })}>Disconnect and forget</button></>
          : <button className="btn primary" disabled={!sp?.client_id || cid.trim() !== sp.client_id} onClick={() => window.open("/spotify/login", "_blank")}><Icon name="globe" size={15} />Connect Spotify</button>}
      </div>
      {sp?.error && <p className="hint" style={{ color: "var(--bad)", marginTop: 10 }}>{sp.error}</p>}
    </section>

    <section className="setgroup"><h3>Now playing</h3>
      {t ? <><div className="trow"><div><div className="t">{t.title || "Unknown"}</div><div className="d">{[t.artist, t.album].filter(Boolean).join(" · ") || "—"} · {t.source === "spotify" ? "Spotify" : "Chrome"} · {t.playing ? "Playing" : "Paused"}</div></div></div>
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button className="btn icon" aria-label="Previous" onClick={() => cmd("prev")}><Icon name="skipprev" size={16} /></button>
          <button className="btn icon" aria-label={t.playing ? "Pause" : "Play"} onClick={() => cmd("play")}><Icon name={t.playing ? "pause" : "play"} size={16} /></button>
          <button className="btn icon" aria-label="Next" onClick={() => cmd("next")}><Icon name="skipnext" size={16} /></button>
          {t.caps.includes("like") && <button className="btn icon" aria-pressed={!!t.liked} aria-label="Save" onClick={() => cmd("like")}><Icon name="heart" size={16} /></button>}
          {t.caps.includes("shuffle") && <button className="btn icon" aria-pressed={!!t.shuffle} aria-label="Shuffle" onClick={() => cmd("shuffle")}><Icon name="shuffle" size={16} /></button>}
          {t.caps.includes("repeat") && <button className="btn icon" aria-pressed={!!t.repeat} aria-label="Repeat" onClick={() => cmd("repeat")}><Icon name="repeat" size={16} /></button>}
        </div>
        {m && m.queue.length > 0 && <><h3 style={{ marginTop: 18 }}>Up next</h3>{m.queue.slice(0, 5).map((q, i) => <div key={i} className="trow"><div className="t">{q.title}<span className="d" style={{ display: "block" }}>{q.artist}</span></div></div>)}</>}</>
        : <p className="muted" style={{ margin: 0 }}>Nothing detected yet. Play something in Spotify or in Chrome.</p>}
      <p className="hint" style={{ marginTop: 14 }}>Coming next: browsing the queue and playlists from the Push.</p>
    </section>
  </>);
}

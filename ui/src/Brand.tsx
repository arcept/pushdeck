// The Push Deck brand lockup: the animated 3 x 3 pad mark + the name. One component so the top bar, the splash and anything else look the same.
// stacked = the name on two lines (used on the splash). Styles: .brand in styles.css (size it with font-size and the .mark width/height where it is used).
export default function Brand({ stacked = false }: { stacked?: boolean }) {
  return (
    <div className="brand">
      <span className="mark" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ ["--i" as string]: (i % 3) + Math.floor(i / 3) }} />)}</span>
      <span className="name" aria-label="Push Deck">{stacked ? <><span>Push</span><span>Deck</span></> : "Push Deck"}</span>
    </div>
  );
}

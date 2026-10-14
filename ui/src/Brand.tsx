// The Push Deck brand lockup: the animated 3 x 3 pad mark + the name. One component so the top bar, the splash and anything else look the same.
// Styles: .brand in styles.css (size it with font-size and the .mark width/height where it is used).
export default function Brand() {
  return (
    <div className="brand">
      <span className="mark" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ ["--i" as string]: (i % 3) + Math.floor(i / 3) }} />)}</span>
      <span className="name">Push Deck</span>
    </div>
  );
}

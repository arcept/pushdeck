import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// The layout is built for 1600 x 900 and up. In a smaller window (a small screen: the app window never goes below the minimum, but a browser tab can) the whole page
// is scaled down to fit instead of breaking.
const fit = () => { const z = Math.min(1, window.innerWidth / 1600, window.innerHeight / 900); document.documentElement.style.zoom = z < 0.999 ? String(z) : ""; };
window.addEventListener("resize", fit); fit();

createRoot(document.getElementById("root")!).render(<App />);

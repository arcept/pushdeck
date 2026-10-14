import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// The version shown on the splash: the number in ../VERSION, or "dev" in dev mode (./dev.sh sets PUSH_DEV).
const version = process.env.PUSH_DEV ? "dev" : (() => { try { return readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim(); } catch { return "dev"; } })();

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
});

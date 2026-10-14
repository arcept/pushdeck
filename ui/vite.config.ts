import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";

// The version shown on the splash: the git tag + commit, or "dev" when git is not available.
const version = (() => { try { return execSync("git describe --tags --always --dirty", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "dev"; } })();

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Set base to your repo name if deploying to https://<user>.github.io/<repo>/
// e.g. base: "/group-scoreboard/"  -- change this before deploying to GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: "/speaking/",
});

import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
  },
  server: {
    open: true,
  },
  optimizeDeps: {
    include: ["@chenglou/pretext"],
  },
});

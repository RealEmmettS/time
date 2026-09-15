import { defineConfig } from "vite";
import { createTimeHandler } from "./server/reference-clock.js";

export default defineConfig({
  root: ".",
  plugins: [
    {
      name: "local-time-api",
      configureServer(server) {
        const handler = createTimeHandler();
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.split("?")[0] !== "/api/time") return next();
          const response = await handler(
            new Request(`http://localhost${req.url}`),
          );
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        });
      },
    },
  ],
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

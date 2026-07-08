import react from "@vitejs/plugin-react";
import { defineConfig, Plugin } from "vite";

function fakeLoginApi(): Plugin {
  return {
    name: "ui-sentinel-fake-login-api",
    configureServer(server) {
      server.middlewares.use("/api/login", (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        response.statusCode = 401;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            ok: false,
            message: "Demo login always fails; this endpoint exists for network evidence.",
          }),
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), fakeLoginApi()],
  server: {
    port: 5273,
  },
});

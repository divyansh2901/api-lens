import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), tailwindcss()],
    root: ".",
    server: {
      proxy: {
        "/api": env.API_LENS_BACKEND_URL ?? "http://localhost:5000",
      },
    },
  };
});

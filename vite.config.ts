import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error módulo .mjs sin tipos
import walqoDbRpc from "./scripts/web/vite-db-rpc.mjs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// @ts-expect-error process is a nodejs global
const root: string = process.cwd();

/** WalQo Web (`vite --mode web`): la misma app en el navegador, con la base en workers/walqo-web. */
function webOptions() {
  const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as { version: string };
  const shim = (file: string) => `${root}/src/web/shims/${file}`;
  return {
    // El build se publica en walqo.pro/web/ (GitHub Pages, carpeta docs/web).
    base: "/web/",
    plugins: [walqoDbRpc({ root })],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: {
      alias: {
        "@tauri-apps/plugin-sql": shim("pluginSql.ts"),
        "@tauri-apps/api/core": shim("tauriCore.ts"),
        "@tauri-apps/api/app": shim("tauriMisc.ts"),
        "@tauri-apps/api/event": shim("tauriMisc.ts"),
        "@tauri-apps/plugin-opener": shim("tauriMisc.ts"),
        "@tauri-apps/plugin-process": shim("tauriMisc.ts"),
        "@tauri-apps/plugin-updater": shim("tauriMisc.ts"),
      },
    },
    build: {
      outDir: "dist-web",
      // Chrome 109 y Firefox 115 son los últimos para Windows 7.
      target: ["chrome109", "firefox115", "safari15"],
      cssTarget: ["chrome109", "firefox115", "safari15"],
      chunkSizeWarningLimit: 1200,
    },
    server: { port: 1430, strictPort: true },
  };
}

// https://vite.dev/config/
export default defineConfig(async ({ mode, command }) => {
  if (mode === "web") {
    const web = webOptions();
    return {
      base: command === "build" ? web.base : "/",
      plugins: [web.plugins[0], react(), tailwindcss()],
      define: web.define,
      resolve: web.resolve,
      build: web.build,
      server: web.server,
    };
  }

  return {
    plugins: [react(), tailwindcss()],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    build: {
      chunkSizeWarningLimit: 1200,
    },
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});

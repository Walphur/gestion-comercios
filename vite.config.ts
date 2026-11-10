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

/** GitHub Pages no deja poner headers: la política va como <meta>. El iframe de impresión la hereda. */
const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https://walqo.pro",
  "connect-src 'self' https://*.walphur.workers.dev https://dolarapi.com http://127.0.0.1:8790 http://127.0.0.1:8787",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function webSecurityHeaders() {
  return {
    name: "walqo-web-csp",
    apply: "build" as const,
    transformIndexHtml(html: string) {
      const tags =
        `\n    <meta http-equiv="Content-Security-Policy" content="${WEB_CSP}" />` +
        `\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`;
      if (!/<meta charset="UTF-8" \/>/.test(html)) throw new Error("index.html: falta <meta charset> para la CSP.");
      return html.replace(/<meta charset="UTF-8" \/>/, (m) => m + tags);
    },
  };
}

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
    server: {
      port: 1430,
      strictPort: true,
      // src-tauri/target tiene archivos trabados mientras compila la PC (EBUSY tira abajo Vite).
      watch: { ignored: ["**/src-tauri/**", "**/dist-web/**", "**/docs/**", "**/workers/**"] },
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async ({ mode, command }) => {
  if (mode === "web") {
    const web = webOptions();
    return {
      base: command === "build" ? web.base : "/",
      plugins: [web.plugins[0], webSecurityHeaders(), react(), tailwindcss()],
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
        // 3. tell Vite to ignore watching `src-tauri` (y el build web, que se reescribe entero)
        ignored: ["**/src-tauri/**", "**/dist-web/**", "**/docs/**"],
      },
    },
  };
});

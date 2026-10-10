import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PHONE_PAGE } from "../../../workers/catalogo-movil/src/phone.ts";
import { APPLE_TOUCH_ICON } from "../../../workers/catalogo-movil/src/icon.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "www");
const resources = join(root, "resources");
mkdirSync(www, { recursive: true });
mkdirSync(resources, { recursive: true });

writeFileSync(join(www, "index.html"), PHONE_PAGE, "utf8");
const icon = Buffer.from(APPLE_TOUCH_ICON, "base64");
writeFileSync(join(www, "apple-touch-icon.png"), icon);
writeFileSync(
  join(www, "manifest.webmanifest"),
  JSON.stringify(
    {
      name: "WalQo Catálogo",
      short_name: "WalQo",
      start_url: "index.html",
      display: "standalone",
      background_color: "#eef2f6",
      theme_color: "#1d4ed8",
      icons: [{ src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    null,
    2,
  ),
);

const icon1024 = await sharp(icon)
  .resize(1024, 1024, { fit: "cover" })
  .png()
  .toBuffer();
writeFileSync(join(resources, "icon.png"), icon1024);

const densities: Record<string, number> = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const androidRes = join(root, "android", "app", "src", "main", "res");
if (existsSync(androidRes)) {
  for (const [bucket, size] of Object.entries(densities)) {
    const dir = join(androidRes, "mipmap-" + bucket);
    mkdirSync(dir, { recursive: true });
    const png = await sharp(icon1024).resize(size, size, { fit: "cover" }).png().toBuffer();
    for (const file of ["ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"]) {
      writeFileSync(join(dir, file), png);
    }
  }
}
const iosIcon = join(root, "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png");
if (existsSync(dirname(iosIcon))) writeFileSync(iosIcon, icon1024);

if (!PHONE_PAGE.includes("BarcodeDetector") || !PHONE_PAGE.includes("/v1/catalog") || !PHONE_PAGE.includes("walqo_catalog_token")) {
  throw new Error("La interfaz empaquetada perdió el lector, la API o la sesión.");
}

const zxingUrl = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
const zxing = await fetch(zxingUrl);
if (!zxing.ok) throw new Error("No se pudo bajar el lector de códigos.");
writeFileSync(join(www, "zxing.min.js"), Buffer.from(await zxing.arrayBuffer()));
console.log("www listo");

/**
 * Genera productos-verduleria-walqo.csv y baja fotos libres (Wikimedia Commons)
 * a imagenes/{codigo}.jpg. Las URLs del CSV apuntan a Special:FilePath (estable).
 */
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const __dir = dirname(fileURLToPath(import.meta.url));
const IMG_DIR = join(__dir, "imagenes");

/** @type {{ code: number, name: string, cat: string, unit: string, cost: number, price: number, stock: number, min: number, wiki: string }[]} */
const PRODUCTS = [
  // Frutas
  { code: 100, name: "Manzana roja", cat: "Frutas", unit: "kg", cost: 2200, price: 3500, stock: 40, min: 8, wiki: "Red_Apple.jpg" },
  { code: 101, name: "Manzana verde", cat: "Frutas", unit: "kg", cost: 2300, price: 3600, stock: 30, min: 6, wiki: "Granny_smith_and_cross_section.jpg" },
  { code: 102, name: "Banana", cat: "Frutas", unit: "kg", cost: 1800, price: 2800, stock: 50, min: 10, wiki: "Banana-Single.jpg" },
  { code: 103, name: "Naranja", cat: "Frutas", unit: "kg", cost: 1200, price: 2000, stock: 45, min: 10, wiki: "OrangeBloss_wb.jpg" },
  { code: 104, name: "Mandarina", cat: "Frutas", unit: "kg", cost: 1400, price: 2300, stock: 35, min: 8, wiki: "TangerineFruit.jpg" },
  { code: 105, name: "Limón", cat: "Frutas", unit: "kg", cost: 1500, price: 2500, stock: 40, min: 8, wiki: "Lemon.jpg" },
  { code: 106, name: "Pomelo", cat: "Frutas", unit: "kg", cost: 1600, price: 2600, stock: 20, min: 5, wiki: "Grapefruit-Whole-Split.jpg" },
  { code: 107, name: "Durazno", cat: "Frutas", unit: "kg", cost: 2500, price: 4000, stock: 25, min: 5, wiki: "Autumn_Red_peaches.jpg" },
  { code: 108, name: "Nectarina", cat: "Frutas", unit: "kg", cost: 2600, price: 4100, stock: 20, min: 5, wiki: "Nectarines.jpg" },
  { code: 109, name: "Ciruela", cat: "Frutas", unit: "kg", cost: 2800, price: 4500, stock: 18, min: 4, wiki: "Plums.jpg" },
  { code: 110, name: "Uva", cat: "Frutas", unit: "kg", cost: 3200, price: 5200, stock: 22, min: 5, wiki: "Table_grapes.jpg" },
  { code: 111, name: "Frutilla", cat: "Frutas", unit: "kg", cost: 4500, price: 7200, stock: 12, min: 3, wiki: "Strawberry_-_whole_and_cut.jpg" },
  { code: 112, name: "Kiwi", cat: "Frutas", unit: "kg", cost: 3800, price: 6000, stock: 15, min: 4, wiki: "Kiwi_aka.jpg" },
  { code: 113, name: "Pera", cat: "Frutas", unit: "kg", cost: 2000, price: 3200, stock: 30, min: 6, wiki: "Pears.jpg" },
  { code: 114, name: "Ananá", cat: "Frutas", unit: "u.", cost: 2500, price: 4200, stock: 15, min: 3, wiki: "Pineapple_and_cross_section.jpg" },
  { code: 115, name: "Melón", cat: "Frutas", unit: "kg", cost: 900, price: 1600, stock: 25, min: 5, wiki: "Cantaloupe_and_cross_section.jpg" },
  { code: 116, name: "Sandía", cat: "Frutas", unit: "kg", cost: 700, price: 1200, stock: 40, min: 8, wiki: "Watermelon_cross_BNC.jpg" },
  { code: 117, name: "Palta", cat: "Frutas", unit: "u.", cost: 1800, price: 3000, stock: 30, min: 6, wiki: "Avocado_with_cross_section.jpg" },
  { code: 118, name: "Mango", cat: "Frutas", unit: "kg", cost: 3500, price: 5600, stock: 12, min: 3, wiki: "Mangoes_picholine_and_keitt.jpg" },
  { code: 119, name: "Papaya", cat: "Frutas", unit: "kg", cost: 2800, price: 4500, stock: 10, min: 2, wiki: "Papaya_cross_section_BNC.jpg" },
  { code: 120, name: "Cereza", cat: "Frutas", unit: "kg", cost: 6500, price: 9800, stock: 8, min: 2, wiki: "Cherry_Stella444.jpg" },
  { code: 121, name: "Arándano", cat: "Frutas", unit: "kg", cost: 9000, price: 14000, stock: 6, min: 1, wiki: "Blueberries.jpg" },
  { code: 122, name: "Frambuesa", cat: "Frutas", unit: "kg", cost: 10000, price: 15500, stock: 5, min: 1, wiki: "Raspberry_-_whole_and_half.jpg" },
  { code: 123, name: "Membrillo", cat: "Frutas", unit: "kg", cost: 1800, price: 2900, stock: 15, min: 3, wiki: "Quince.jpg" },
  { code: 124, name: "Higo", cat: "Frutas", unit: "kg", cost: 4200, price: 6800, stock: 8, min: 2, wiki: "Common_fig_fruit.jpg" },
  { code: 125, name: "Granada", cat: "Frutas", unit: "u.", cost: 2200, price: 3600, stock: 12, min: 3, wiki: "Pomegranate3.jpg" },
  { code: 126, name: "Coco", cat: "Frutas", unit: "u.", cost: 2000, price: 3400, stock: 10, min: 2, wiki: "Coconut_-_whole_and_in_cross_section.jpg" },
  { code: 127, name: "Maracuyá", cat: "Frutas", unit: "kg", cost: 4000, price: 6500, stock: 8, min: 2, wiki: "Passion_fruit_-_whole_and_cross_section.jpg" },
  { code: 128, name: "Lima", cat: "Frutas", unit: "kg", cost: 2800, price: 4500, stock: 12, min: 3, wiki: "Lime-whole-and-in-halves.jpg" },

  // Verduras
  { code: 129, name: "Papa", cat: "Verduras", unit: "kg", cost: 700, price: 1200, stock: 80, min: 15, wiki: "Patates.jpg" },
  { code: 130, name: "Batata", cat: "Verduras", unit: "kg", cost: 900, price: 1500, stock: 35, min: 8, wiki: "Ipomoea_batatas_006.JPG" },
  { code: 131, name: "Tomate redondo", cat: "Verduras", unit: "kg", cost: 2000, price: 3200, stock: 40, min: 8, wiki: "Tomato_-_whole_and_cross_section.jpg" },
  { code: 132, name: "Tomate perita", cat: "Verduras", unit: "kg", cost: 1900, price: 3000, stock: 35, min: 8, wiki: "Roma_tomato.jpg" },
  { code: 133, name: "Cebolla", cat: "Verduras", unit: "kg", cost: 800, price: 1400, stock: 50, min: 10, wiki: "Onion_on_white.jpg" },
  { code: 134, name: "Cebolla de verdeo", cat: "Verduras", unit: "atado", cost: 500, price: 900, stock: 25, min: 5, wiki: "Spring_Onions.jpg" },
  { code: 135, name: "Ajo", cat: "Verduras", unit: "kg", cost: 3500, price: 5500, stock: 15, min: 3, wiki: "Garlic_Bulb_and_Cloves.jpg" },
  { code: 136, name: "Zanahoria", cat: "Verduras", unit: "kg", cost: 900, price: 1500, stock: 40, min: 8, wiki: "Carrots_of_many_colors.jpg" },
  { code: 137, name: "Zapallo anco", cat: "Verduras", unit: "kg", cost: 600, price: 1100, stock: 30, min: 6, wiki: "Cucurbita_moschata_Butternut_2010_G1.jpg" },
  { code: 138, name: "Zapallo criollo", cat: "Verduras", unit: "kg", cost: 550, price: 1000, stock: 25, min: 5, wiki: "Cucurbita_maxima_Kabocha_group_1.jpg" },
  { code: 139, name: "Zapallito", cat: "Verduras", unit: "kg", cost: 1200, price: 2000, stock: 25, min: 5, wiki: "Zucchini-Whole.jpg" },
  { code: 140, name: "Berenjena", cat: "Verduras", unit: "kg", cost: 1400, price: 2300, stock: 20, min: 4, wiki: "Aubergine.jpg" },
  { code: 141, name: "Morrón rojo", cat: "Verduras", unit: "kg", cost: 2800, price: 4500, stock: 18, min: 4, wiki: "Red_capsicum_and_cross_section.jpg" },
  { code: 142, name: "Morrón verde", cat: "Verduras", unit: "kg", cost: 2200, price: 3600, stock: 18, min: 4, wiki: "Green-Yellow-Red-Pepper-2009.jpg" },
  { code: 143, name: "Morrón amarillo", cat: "Verduras", unit: "kg", cost: 3000, price: 4800, stock: 12, min: 3, wiki: "Yellow_capsicum.jpg" },
  { code: 144, name: "Pepino", cat: "Verduras", unit: "kg", cost: 1100, price: 1800, stock: 22, min: 5, wiki: "Cucumber_-_whole_and_cross_section.jpg" },
  { code: 145, name: "Chaucha", cat: "Verduras", unit: "kg", cost: 2500, price: 4000, stock: 12, min: 3, wiki: "Green_beans.jpg" },
  { code: 146, name: "Arveja", cat: "Verduras", unit: "kg", cost: 3200, price: 5200, stock: 10, min: 2, wiki: "Peas_in_pods_-_Studio.jpg" },
  { code: 147, name: "Choclo", cat: "Verduras", unit: "u.", cost: 600, price: 1100, stock: 40, min: 8, wiki: "Corncobs.jpg" },
  { code: 148, name: "Lechuga mantecosa", cat: "Verduras", unit: "u.", cost: 700, price: 1300, stock: 30, min: 6, wiki: "Iceberg_lettuce_in_SB.jpg" },
  { code: 149, name: "Lechuga crespa", cat: "Verduras", unit: "u.", cost: 750, price: 1400, stock: 28, min: 6, wiki: "Lactuca_sativa_var_crispa.jpg" },
  { code: 150, name: "Rúcula", cat: "Verduras", unit: "atado", cost: 600, price: 1100, stock: 20, min: 4, wiki: "Eruca_sativa.jpg" },
  { code: 151, name: "Acelga", cat: "Verduras", unit: "atado", cost: 500, price: 900, stock: 25, min: 5, wiki: "Swiss_chard.jpg" },
  { code: 152, name: "Espinaca", cat: "Verduras", unit: "atado", cost: 700, price: 1300, stock: 20, min: 4, wiki: "Spinach_leaves.jpg" },
  { code: 153, name: "Repollo", cat: "Verduras", unit: "u.", cost: 900, price: 1600, stock: 18, min: 4, wiki: "White_cabbage.jpg" },
  { code: 154, name: "Coliflor", cat: "Verduras", unit: "u.", cost: 1800, price: 3000, stock: 15, min: 3, wiki: "Cauliflower_-_Whole_and_Half.jpg" },
  { code: 155, name: "Brócoli", cat: "Verduras", unit: "u.", cost: 2000, price: 3300, stock: 15, min: 3, wiki: "Broccoli_and_cross_section.jpg" },
  { code: 156, name: "Remolacha", cat: "Verduras", unit: "kg", cost: 1000, price: 1700, stock: 20, min: 4, wiki: "Beetroot_-_whole_and_cut.jpg" },
  { code: 157, name: "Rabanito", cat: "Verduras", unit: "atado", cost: 500, price: 900, stock: 15, min: 3, wiki: "Radish_37_bg_041006.jpg" },
  { code: 158, name: "Apio", cat: "Verduras", unit: "u.", cost: 900, price: 1600, stock: 18, min: 4, wiki: "Celery_stalks.jpg" },
  { code: 159, name: "Hinojo", cat: "Verduras", unit: "u.", cost: 1200, price: 2000, stock: 12, min: 3, wiki: "Foeniculum_vulgare.jpg" },
  { code: 160, name: "Alcaucil", cat: "Verduras", unit: "u.", cost: 1500, price: 2500, stock: 20, min: 4, wiki: "Artichoke_J1.jpg" },
  { code: 161, name: "Espárrago", cat: "Verduras", unit: "kg", cost: 5500, price: 8500, stock: 8, min: 2, wiki: "Asparagus-Bundle.jpg" },
  { code: 162, name: "Champiñón", cat: "Verduras", unit: "kg", cost: 2800, price: 4500, stock: 12, min: 3, wiki: "White_button_mushroom.jpg" },
  { code: 163, name: "Hongos portobello", cat: "Verduras", unit: "kg", cost: 4000, price: 6500, stock: 8, min: 2, wiki: "Portobello_mushrooms.jpg" },
  { code: 164, name: "Radicheta", cat: "Verduras", unit: "atado", cost: 500, price: 950, stock: 15, min: 3, wiki: "Cichorium_intybus-alme.jpg" },
  { code: 165, name: "Achicoria", cat: "Verduras", unit: "atado", cost: 550, price: 1000, stock: 12, min: 3, wiki: "Cichorium_endivia.jpg" },
  { code: 166, name: "Berro", cat: "Verduras", unit: "atado", cost: 600, price: 1100, stock: 10, min: 2, wiki: "Nasturtium_officinale.jpg" },
  { code: 167, name: "Kale", cat: "Verduras", unit: "atado", cost: 900, price: 1600, stock: 10, min: 2, wiki: "Brassica_oleracea_var_sabellica.jpg" },
  { code: 168, name: "Coles de Bruselas", cat: "Verduras", unit: "kg", cost: 3200, price: 5200, stock: 10, min: 2, wiki: "Brussels_sprouts.jpg" },
  { code: 169, name: "Puerro", cat: "Verduras", unit: "kg", cost: 1400, price: 2300, stock: 15, min: 3, wiki: "Leeks.jpg" },
  { code: 170, name: "Nabiza / nabo", cat: "Verduras", unit: "kg", cost: 900, price: 1500, stock: 12, min: 3, wiki: "Turnip_2622027.jpg" },

  // Hierbas
  { code: 171, name: "Perejil", cat: "Hierbas", unit: "atado", cost: 300, price: 600, stock: 30, min: 6, wiki: "Parsley.jpg" },
  { code: 172, name: "Cilantro", cat: "Hierbas", unit: "atado", cost: 350, price: 700, stock: 25, min: 5, wiki: "Coriander_Coriandrum_sativum.jpg" },
  { code: 173, name: "Albahaca", cat: "Hierbas", unit: "atado", cost: 500, price: 950, stock: 18, min: 4, wiki: "Basil-Basilico-Ocimum_basilicum-albahaca.jpg" },
  { code: 174, name: "Orégano fresco", cat: "Hierbas", unit: "atado", cost: 450, price: 850, stock: 15, min: 3, wiki: "Origanum_vulgare_-_oregano.jpg" },
  { code: 175, name: "Menta", cat: "Hierbas", unit: "atado", cost: 400, price: 800, stock: 15, min: 3, wiki: "Mint.jpg" },
  { code: 176, name: "Romero", cat: "Hierbas", unit: "atado", cost: 450, price: 850, stock: 12, min: 3, wiki: "Rosemary.jpg" },
  { code: 177, name: "Tomillo", cat: "Hierbas", unit: "atado", cost: 450, price: 850, stock: 10, min: 2, wiki: "Thymus_vulgaris.jpg" },
  { code: 178, name: "Laurel", cat: "Hierbas", unit: "atado", cost: 400, price: 750, stock: 12, min: 3, wiki: "Laurus_nobilis.jpg" },
  { code: 179, name: "Cebollín", cat: "Hierbas", unit: "atado", cost: 400, price: 800, stock: 14, min: 3, wiki: "Allium_schoenoprasum.jpg" },
  { code: 180, name: "Eneldo", cat: "Hierbas", unit: "atado", cost: 450, price: 850, stock: 10, min: 2, wiki: "Anethum_graveolens.jpg" },
];

function wikiUrl(fileName) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=800`;
}

function csvEscape(s) {
  const t = String(s ?? "");
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

async function downloadOne(code, wiki) {
  const dest = join(IMG_DIR, `${code}.jpg`);
  const url = wikiUrl(wiki);
  const res = await fetch(url, {
    headers: { "User-Agent": "WalQoCatalogBuilder/1.0 (demo plantilla; contact walqo.pro)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${wiki}`);
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (!type.includes("image") && !type.includes("octet-stream")) {
    throw new Error(`No image (${type}) for ${wiki}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

async function main() {
  await mkdir(IMG_DIR, { recursive: true });

  const header =
    "barcode,nombre,precio,costo,stock,sku,categoria,marca,proveedor,min_stock,unidad,imagen";
  const lines = [header];
  let ok = 0;
  let fail = 0;

  for (const p of PRODUCTS) {
    const url = wikiUrl(p.wiki);
    // Preferimos URL pública (PC + Web). También bajamos copia local para offline.
    lines.push(
      [
        p.code,
        csvEscape(p.name),
        p.price,
        p.cost,
        p.stock,
        "",
        csvEscape(p.cat),
        "",
        csvEscape("Mercado Central"),
        p.min,
        csvEscape(p.unit),
        csvEscape(url),
      ].join(","),
    );
    try {
      process.stdout.write(`Bajando ${p.code} ${p.name}… `);
      await downloadOne(p.code, p.wiki);
      console.log("ok");
      ok += 1;
    } catch (e) {
      console.log(`FALLÓ: ${e.message || e}`);
      fail += 1;
    }
  }

  const csvPath = join(__dir, "productos-verduleria-walqo.csv");
  await writeFile(csvPath, lines.join("\n") + "\n", "utf8");
  console.log(`\nCSV: ${csvPath}`);
  console.log(`Productos: ${PRODUCTS.length} · fotos ok: ${ok} · fallidas: ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

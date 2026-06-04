import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Package, Upload, AlertCircle } from "lucide-react";
import { Button, Card } from "./ui";
import {
  getAppStorageInfo,
  getCatalogWizardState,
  pickSupermarketCsvFile,
  type AppStorageInfo,
} from "../lib/tauri";

interface Props {
  /** Si true, muestra botón que lleva a Productos para importar. */
  showOpenProducts?: boolean;
  onFlash?: (msg: string) => void;
}

export default function CatalogSupermarketPanel({
  showOpenProducts = true,
  onFlash,
}: Props) {
  const [storage, setStorage] = useState<AppStorageInfo | null>(null);
  const [bundled, setBundled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getAppStorageInfo().then(setStorage).catch(() => setStorage(null));
    getCatalogWizardState()
      .then((s) => {
        setBundled(s.bundled);
        setReady(s.catalog_ready);
      })
      .catch(() => {
        setBundled(false);
        setReady(false);
      });
  }, []);

  async function pickCsvOnce() {
    try {
      const path = await pickSupermarketCsvFile();
      if (path) {
        onFlash?.("CSV guardado. Andá a Productos → Catálogo supermercado para importar.");
        getAppStorageInfo().then(setStorage).catch(() => {});
        getCatalogWizardState()
          .then((s) => setReady(s.catalog_ready || s.bundled))
          .catch(() => {});
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const inInstaller = bundled || ready;

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <Package size={18} className="text-brand-600" />
        Módulo catálogo supermercado (~190.000)
      </h3>
      <p className="mb-4 text-sm text-ink-muted">
        Producto <strong className="text-ink">aparte</strong> de la app base. El instalador normal no
        lo trae; el instalador completo o el CSV se venden/entregan por separado. Importación desde{" "}
        <strong className="text-ink">Productos</strong>.
      </p>

      {inInstaller ? (
        <p className="mb-3 flex items-center gap-2 text-sm text-brand-600 dark:text-brand-300">
          <CheckCircle2 size={18} />
          Catálogo disponible en el instalador o en la carpeta de datos.
        </p>
      ) : (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-ink">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            El instalador de actualización (GitHub) es <strong>liviano</strong> y no trae el CSV
            grande. Para tenerlo adentro: compilá con <code className="text-xs">compilar-instalador.bat</code>{" "}
            o elegí el archivo <code className="text-xs">productos_supermercado.csv</code> una vez.
          </span>
        </p>
      )}

      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
        <li>
          Menú <strong className="text-ink">Productos</strong> (ícono caja).
        </li>
        <li>
          Botón <strong className="text-ink">Catálogo supermercado</strong> (arriba a la derecha).
        </li>
        <li>
          Elegí categorías o importá todo. Para Excel de otro programa:{" "}
          <strong className="text-ink">Excel / CSV</strong>.
        </li>
      </ol>

      <div className="flex flex-wrap gap-2">
        {showOpenProducts && (
          <Link to="/productos?abrir=supermercado">
            <Button>
              <Upload size={16} /> Abrir importación de catálogo
            </Button>
          </Link>
        )}
        {!inInstaller && (
          <Button variant="secondary" onClick={() => void pickCsvOnce()}>
            <Upload size={16} /> Elegir productos_supermercado.csv
          </Button>
        )}
      </div>

      {storage && (
        <p className="mt-4 text-xs text-ink-muted">
          Archivo en disco: {storage.catalog_csv_path}
          <br />
          {storage.catalog_csv_ready ? "✓ CSV listo para importar" : "○ Aún sin CSV en AppData"}
        </p>
      )}
    </Card>
  );
}

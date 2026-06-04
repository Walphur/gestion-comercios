import { useEffect, useState } from "react";
import { Eraser, Sparkles } from "lucide-react";
import { Button, Card } from "./ui";
import { countDemoProductsActive, removeDemoCatalog, seedDemoCatalog } from "../db/demo";
import { confirmAction } from "../lib/confirm";
import { formatDbError, isDbCorruptionError } from "../lib/dbError";

interface Props {
  onFlash?: (msg: string) => void;
  onChanged?: () => void;
}

export default function DemoProductsPanel({ onFlash, onChanged }: Props) {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    countDemoProductsActive().then(setCount).catch(() => setCount(0));
  }, []);

  async function loadDemo() {
    setBusy(true);
    try {
      const r = await seedDemoCatalog();
      onFlash?.(`Ejemplos: ${r.added} nuevos, ${r.skipped} ya existían.`);
      setCount(await countDemoProductsActive());
      onChanged?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeDemo() {
    if (
      !(await confirmAction({
        title: "Quitar ejemplos",
        message: "¿Quitar todos los productos de demostración?",
        variant: "danger",
        confirmLabel: "Sí, quitar",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const n = await removeDemoCatalog();
      onFlash?.(n > 0 ? `Se quitaron ${n} ejemplos.` : "No había ejemplos activos.");
      setCount(0);
      onChanged?.();
    } catch (e) {
      const msg = formatDbError(e);
      alert(
        isDbCorruptionError(e)
          ? `${msg}\n\nAdministración → Reparar base de datos o Restaurar .bak.`
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <Sparkles size={18} className="text-brand-600" />
        Productos de ejemplo
      </h3>
      <p className="mb-4 text-sm text-ink-muted">
        ~20 artículos de kiosco para probar la app. No son el catálogo de 200.000 (ese es el módulo
        super aparte).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void loadDemo()}>
          <Sparkles size={16} /> {busy ? "Cargando…" : "Cargar ejemplos"}
        </Button>
        {count > 0 && (
          <Button variant="secondary" disabled={busy} onClick={() => void removeDemo()}>
            <Eraser size={16} /> Quitar ejemplos ({count})
          </Button>
        )}
      </div>
    </Card>
  );
}

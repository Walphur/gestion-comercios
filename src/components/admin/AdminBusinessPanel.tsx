import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../../db/settings";
import { getDb } from "../../db/index";
import { Input } from "../ui";
import { useAppConfig } from "../../context/AppConfig";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminBusinessPanel({ onFlash }: Props) {
  const cfg = useAppConfig();
  const [fiscalEnabled, setFiscalEnabled] = useState(false);
  const [arqueos, setArqueos] = useState<
    { id: number; closed_at: string; declared_cash: number; cash_difference: number }[]
  >([]);

  useEffect(() => {
    getSetting("fiscal_enabled").then((v) => setFiscalEnabled(v === "1"));
    void getDb().then(async (db) => {
      const rows = await db.select<
        { id: number; closed_at: string; declared_cash: number; cash_difference: number }[]
      >(
        `SELECT id, closed_at, declared_cash, cash_difference FROM cash_sessions
         WHERE status = 'closed' ORDER BY id DESC LIMIT 20`,
      );
      setArqueos(rows);
    });
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <h4 className="text-sm font-semibold text-ink">Seguridad</h4>
        <div className="mt-3 max-w-xs">
          <Input
            label="PIN de administrador"
            defaultValue={cfg.adminPin}
            onBlur={(e) => {
              void cfg.setAdminPin(e.target.value).then(() => onFlash("PIN guardado"));
            }}
          />
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-ink">Facturación electrónica</h4>
        <p className="mt-1 text-xs text-ink-muted">
          Encola ventas para sincronizar con ARCA cuando hay internet.
        </p>
        <div className="mt-3 inline-flex rounded-xl border border-[var(--color-panel-border)] bg-brand-50 p-1 dark:bg-brand-900/40">
          <button
            type="button"
            onClick={async () => {
              setFiscalEnabled(true);
              await setSetting("fiscal_enabled", "1");
              onFlash("Facturación activada");
            }}
            className={`rounded-lg px-5 py-2 text-sm font-semibold ${
              fiscalEnabled ? "bg-brand-600 text-white shadow-sm" : "text-ink-muted"
            }`}
          >
            Activo
          </button>
          <button
            type="button"
            onClick={async () => {
              setFiscalEnabled(false);
              await setSetting("fiscal_enabled", "0");
              onFlash("Facturación desactivada");
            }}
            className={`rounded-lg px-5 py-2 text-sm font-semibold ${
              !fiscalEnabled ? "bg-[var(--color-panel)] text-ink shadow-sm ring-1 ring-brand-200" : "text-ink-muted"
            }`}
          >
            Inactivo
          </button>
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-ink">Arqueos ciegos</h4>
        <p className="mt-1 text-xs text-ink-muted">Diferencias de caja al cerrar turno.</p>
        {arqueos.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Sin cierres registrados.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-muted">
                <th className="py-2">Turno</th>
                <th className="py-2">Cierre</th>
                <th className="py-2 text-right">Contado</th>
                <th className="py-2 text-right">Dif.</th>
              </tr>
            </thead>
            <tbody>
              {arqueos.map((a) => (
                <tr key={a.id} className="border-t border-[var(--color-panel-border)]">
                  <td className="py-2">#{a.id}</td>
                  <td className="py-2 text-ink-muted">{a.closed_at ?? "—"}</td>
                  <td className="py-2 text-right">${a.declared_cash.toFixed(2)}</td>
                  <td
                    className={`py-2 text-right font-medium ${
                      Math.abs(a.cash_difference) > 0.01 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    ${a.cash_difference.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

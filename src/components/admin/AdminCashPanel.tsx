import { Lock, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../../db/index";
import { Card, Input } from "../ui";
import { useAppConfig } from "../../context/AppConfig";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminCashPanel({ onFlash }: Props) {
  const cfg = useAppConfig();
  const [arqueos, setArqueos] = useState<
    { id: number; closed_at: string; declared_cash: number; cash_difference: number }[]
  >([]);

  useEffect(() => {
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
      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <Lock size={18} className="text-brand-600" />
          PIN de administrador
        </h3>
        <p className="mb-4 text-sm text-ink-muted">
          Protege la configuración y permite elevar permisos en el mostrador.
        </p>
        <div className="max-w-xs">
          <Input
            label="PIN"
            type="password"
            defaultValue={cfg.adminPin}
            onBlur={(e) => {
              void cfg.setAdminPin(e.target.value).then(() => onFlash("PIN guardado"));
            }}
          />
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <Wallet size={18} className="text-brand-600" />
          Historial de arqueos
        </h3>
        <p className="mb-4 text-sm text-ink-muted">Diferencias al cerrar turno con arqueo ciego.</p>
        {arqueos.length === 0 ? (
          <p className="text-sm text-ink-muted">Sin cierres registrados.</p>
        ) : (
          <table className="w-full text-sm">
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
                  <td className="py-2 text-right whitespace-nowrap tabular-nums">
                    ${a.declared_cash.toFixed(2)}
                  </td>
                  <td
                    className={`py-2 text-right font-medium whitespace-nowrap tabular-nums ${
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
      </Card>
    </div>
  );
}

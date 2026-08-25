import { Eye, EyeOff, Lock, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../../db/index";
import { Card, Input } from "../ui";
import { useAppConfig } from "../../context/AppConfig";
import AdminPaymentSurchargesCard from "./AdminPaymentSurchargesCard";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminCashPanel({ onFlash }: Props) {
  const cfg = useAppConfig();
  const [showPin, setShowPin] = useState(false);
  const [pinValue, setPinValue] = useState(cfg.adminPin);
  const [arqueos, setArqueos] = useState<
    { id: number; closed_at: string; declared_cash: number; cash_difference: number }[]
  >([]);

  useEffect(() => {
    setPinValue(cfg.adminPin);
  }, [cfg.adminPin]);

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
      <AdminPaymentSurchargesCard onFlash={onFlash} />

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
            type={showPin ? "text" : "password"}
            value={pinValue}
            autoComplete="off"
            onChange={(e) => setPinValue(e.target.value)}
            onBlur={() => {
              void cfg.setAdminPin(pinValue).then(() => onFlash("PIN guardado"));
            }}
            endAdornment={
              <button
                type="button"
                className="rounded-lg p-1.5 text-ink-muted hover:bg-brand-50 hover:text-ink dark:hover:bg-brand-950/40"
                aria-label={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                onClick={() => setShowPin((v) => !v)}
              >
                {showPin ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            }
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

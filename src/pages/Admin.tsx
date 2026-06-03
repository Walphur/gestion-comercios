import { useEffect, useState } from "react";
import { getSetting, setSetting } from "../db/settings";
import { getDb } from "../db/index";
import { Lock, Check } from "lucide-react";
import { PageHeader, Card, Button, Input } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { RUBRO_LIST } from "../config/rubros";
import type { FeatureFlags, Rubro } from "../types";

const FEATURE_LABELS: Record<keyof FeatureFlags, string> = {
  pos: "Punto de venta",
  products: "Productos",
  stock: "Stock",
  customers: "Clientes",
  reports: "Reportes",
  invoicing: "Facturación (ARCA)",
};

export default function Admin() {
  const cfg = useAppConfig();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [savedFlash, setSavedFlash] = useState("");
  const [fiscalEnabled, setFiscalEnabled] = useState(false);
  const [arqueos, setArqueos] = useState<
    { id: number; closed_at: string; declared_cash: number; cash_difference: number }[]
  >([]);

  useEffect(() => {
    if (!unlocked) return;
    getSetting("fiscal_enabled").then((v) => setFiscalEnabled(v === "1"));
    getDb().then(async (db) => {
      const rows = await db.select<
        { id: number; closed_at: string; declared_cash: number; cash_difference: number }[]
      >(
        `SELECT id, closed_at, declared_cash, cash_difference FROM cash_sessions
         WHERE status = 'closed' ORDER BY id DESC LIMIT 20`,
      );
      setArqueos(rows);
    });
  }, [unlocked]);

  function tryUnlock() {
    if (pin === cfg.adminPin) {
      setUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  }

  function flash(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(""), 1500);
  }

  if (!unlocked) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Lock className="text-slate-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Acceso de administrador</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">
            Ingresá el PIN para configurar la aplicación.
          </p>
          <Input
            type="password"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setPinError(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
            placeholder="PIN"
            className="text-center"
            autoFocus
          />
          {pinError && <p className="mt-2 text-sm text-red-600">PIN incorrecto.</p>}
          <Button onClick={tryUnlock} className="mt-4 w-full">
            Ingresar
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Administración"
        subtitle="Configurá el rubro, las funciones y los datos del comercio."
        actions={
          savedFlash ? (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <Check size={16} /> {savedFlash}
            </span>
          ) : undefined
        }
      />

      <div className="space-y-6 p-8">
        {/* Datos del comercio */}
        <Card>
          <h3 className="mb-4 text-base font-semibold text-slate-900">Datos del comercio</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Nombre del comercio"
              defaultValue={cfg.businessName}
              onBlur={(e) => {
                cfg.setBusinessName(e.target.value);
                flash("Guardado");
              }}
            />
            <Input
              label="Símbolo de moneda"
              defaultValue={cfg.currency}
              onBlur={(e) => {
                cfg.setCurrency(e.target.value);
                flash("Guardado");
              }}
            />
            <Input
              label="PIN de administrador"
              defaultValue={cfg.adminPin}
              onBlur={(e) => {
                cfg.setAdminPin(e.target.value);
                flash("Guardado");
              }}
            />
          </div>
        </Card>

        {/* Selección de rubro */}
        <Card>
          <h3 className="mb-1 text-base font-semibold text-slate-900">Modo / Rubro</h3>
          <p className="mb-4 text-sm text-slate-500">
            Elegí el rubro. La app adapta automáticamente los campos y las funciones.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {RUBRO_LIST.map((r) => {
              const active = cfg.rubro === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    cfg.setRubro(r.id as Rubro);
                    flash("Modo cambiado");
                  }}
                  className={`rounded-xl border-2 p-4 text-left transition-colors ${
                    active
                      ? "border-indigo-600 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p className="font-semibold text-slate-900">{r.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{r.description}</p>
                  {active && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                      <Check size={13} /> Activo
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 text-base font-semibold text-slate-900">Facturación electrónica (cola)</h3>
          <p className="mb-3 text-sm text-slate-500">
            Si está activo, cada venta se encola en segundo plano (sin pantalla de carga). Rust
            sincroniza con ARCA cuando hay internet.
          </p>
          <button
            onClick={async () => {
              const next = !fiscalEnabled;
              setFiscalEnabled(next);
              await setSetting("fiscal_enabled", next ? "1" : "0");
              flash(next ? "Facturación en cola activada" : "Facturación en cola desactivada");
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              fiscalEnabled ? "bg-emerald-600" : "bg-slate-400"
            }`}
          >
            {fiscalEnabled ? "Activo" : "Inactivo"}
          </button>
        </Card>

        <Card>
          <h3 className="mb-2 text-base font-semibold text-slate-900">Arqueos ciegos (solo admin)</h3>
          <p className="mb-3 text-sm text-slate-500">
            Diferencia entre efectivo contado por el cajero y lo que registró el sistema.
          </p>
          {arqueos.length === 0 ? (
            <p className="text-sm text-slate-400">Sin cierres registrados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Turno</th>
                  <th className="py-2">Cierre</th>
                  <th className="py-2 text-right">Contado</th>
                  <th className="py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {arqueos.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="py-2">#{a.id}</td>
                    <td className="py-2 text-slate-500">{a.closed_at ?? "—"}</td>
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
        </Card>

        {/* Funciones visibles */}
        <Card>
          <h3 className="mb-1 text-base font-semibold text-slate-900">Funciones habilitadas</h3>
          <p className="mb-4 text-sm text-slate-500">
            Activá o desactivá lo que ve el cliente. Por defecto se ajusta según el rubro.
          </p>
          <div className="divide-y divide-slate-100">
            {(Object.keys(FEATURE_LABELS) as (keyof FeatureFlags)[]).map((key) => {
              const enabled = cfg.features[key];
              const overridden = cfg.featureOverrides[key] !== undefined;
              return (
                <div key={key} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{FEATURE_LABELS[key]}</p>
                    {overridden && (
                      <button
                        onClick={() => cfg.setFeatureOverride(key, null)}
                        className="text-xs text-indigo-500 hover:underline"
                      >
                        Volver al valor del rubro
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => cfg.setFeatureOverride(key, !enabled)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      enabled ? "bg-indigo-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        enabled ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

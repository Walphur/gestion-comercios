import { ChefHat, UtensilsCrossed } from "lucide-react";
import { Select, Switch } from "../ui";
import { useAppConfig } from "../../context/AppConfig";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import {
  GASTRO_SUBTYPE_LIST,
  type GastroSubtype,
} from "../../config/gastroSubtypes";
import { confirmAction } from "../../lib/confirm";
import TablesTrialNotice from "../tables/TablesTrialNotice";
import { getMenuPortalStatus } from "../../lib/menuPortalPush";
import { syncTablesToPortal } from "../../lib/tables";

interface Props {
  onFlash: (msg: string) => void;
}

/** Tipo de local gastronómico + módulos operativos (plantilla, no licencia). */
export default function AdminGastroOpsPanel({ onFlash }: Props) {
  const cfg = useAppConfig();
  const { tables: unlimitedTables, waiterPhones: unlimitedWaiters } = usePlanEntitlements();

  if (cfg.rubro !== "gastronomia") return null;

  async function changeSubtype(next: GastroSubtype) {
    const already = cfg.gastroSubtype != null;
    if (already && next !== cfg.gastroSubtype) {
      const ok = await confirmAction({
        title: "Cambiar tipo de local",
        message: "¿Aplicar la configuración sugerida de este tipo?",
        detail:
          "Puede apagar o prender mesas, cocina, llevar/delivery y mozos. Lo que ya configuraste se reemplaza.",
        confirmLabel: "Aplicar sugerencias",
        variant: "danger",
      });
      if (!ok) return;
      await cfg.setGastroSubtype(next, { force: true });
      onFlash("Tipo de local actualizado con las sugerencias.");
      return;
    }
    await cfg.setGastroSubtype(next, { force: !already });
    onFlash(
      already
        ? "Tipo de local guardado."
        : "Tipo de local aplicado. Podés ajustar los módulos abajo.",
    );
  }

  async function toggleTables(on: boolean) {
    await cfg.setTablesEnabled(on);
    if (!on) {
      const portal = await getMenuPortalStatus().catch(() => null);
      if (portal?.enabled) void syncTablesToPortal([]).catch(() => undefined);
    }
    onFlash(on ? "Mesas activado" : "Mesas apagado");
  }

  return (
    <div className="min-w-0 space-y-5">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <UtensilsCrossed size={18} className="text-brand-600" />
          Tipo de local
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          Es una sugerencia inicial. Después podés prender o apagar cada módulo sin cambiar de
          rubro.
        </p>
        <div className="mt-3 max-w-md">
          <Select
            label="Subcategoría"
            value={cfg.gastroSubtype ?? ""}
            onChange={(e) => {
              const v = e.target.value as GastroSubtype;
              if (!v) return;
              void changeSubtype(v);
            }}
          >
            <option value="" disabled>
              Elegí el tipo…
            </option>
            {GASTRO_SUBTYPE_LIST.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          {cfg.gastroSubtype ? (
            <p className="mt-1.5 text-xs text-ink-muted">
              {GASTRO_SUBTYPE_LIST.find((s) => s.id === cfg.gastroSubtype)?.description}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
              Todavía no elegiste un tipo: las mesas siguen el default de gastronomía.
            </p>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-3 border-t border-[var(--color-panel-border)] pt-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <ChefHat size={18} className="text-brand-600" />
          Módulos del local
        </h3>

        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Mesas</p>
            <p className="text-xs text-ink-muted">
              Salón, comandas por ronda, pre-cuenta y QR por mesa.
            </p>
          </div>
          <Switch checked={cfg.tablesEnabled} onChange={(v) => void toggleTables(v)} />
        </div>
        {cfg.tablesEnabled && !unlimitedTables ? <TablesTrialNotice /> : null}

        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Cocina</p>
            <p className="text-xs text-ink-muted">
              Pantalla Cocina (KDS) para mesas y mostrador. Puede estar prendida sin mesas.
            </p>
          </div>
          <Switch
            checked={cfg.kitchenEnabled}
            onChange={(v) => {
              void cfg.setKitchenEnabled(v).then(() => {
                onFlash(v ? "Cocina activada" : "Cocina apagada");
              });
            }}
          />
        </div>

        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Llevar y delivery en caja</p>
            <p className="text-xs text-ink-muted">
              En el punto de venta: mostrador, para llevar o delivery.
            </p>
          </div>
          <Switch
            checked={cfg.posFulfillmentEnabled}
            onChange={(v) => {
              void cfg.setPosFulfillmentEnabled(v).then(() => {
                onFlash(v ? "Llevar / delivery activado" : "Llevar / delivery apagado");
              });
            }}
          />
        </div>

        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Mozos desde el celular</p>
            <p className="text-xs text-ink-muted">
              Enlace walqo.pro/mozo. Hace falta tener Mesas prendido
              {!unlimitedWaiters ? " (tope del plan gratis: 1 mozo)" : ""}.
            </p>
          </div>
          <Switch
            checked={cfg.waiterPhonesEnabled}
            disabled={!cfg.tablesEnabled}
            onChange={(v) => {
              void cfg.setWaiterPhonesEnabled(v).then(() => {
                onFlash(v ? "Mozos activados" : "Mozos apagados");
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

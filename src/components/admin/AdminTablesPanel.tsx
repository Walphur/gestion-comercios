import { Armchair } from "lucide-react";
import { Switch } from "../ui";
import TablesTrialNotice from "../tables/TablesTrialNotice";
import { useAppConfig } from "../../context/AppConfig";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";
import { getMenuPortalStatus } from "../../lib/menuPortalPush";
import { syncTablesToPortal } from "../../lib/tables";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminTablesPanel({ onFlash }: Props) {
  const cfg = useAppConfig();
  const { tables: unlimited } = usePlanEntitlements();

  async function toggle(on: boolean) {
    await cfg.setTablesEnabled(on);
    if (!on) {
      const portal = await getMenuPortalStatus().catch(() => null);
      if (portal?.enabled) void syncTablesToPortal([]).catch(() => undefined);
    }
    onFlash(on ? "Mesas activado" : "Mesas apagado");
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Armchair size={18} className="text-brand-600" />
            Mesas
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            Salón con las mesas libres y ocupadas, cuenta abierta por mesa, comandas a cocina por ronda, pre-cuenta y
            un QR por mesa para que el cliente pida, llame al mozo o pida la cuenta. Suma «Mesas» al menú.
          </p>
        </div>
        <Switch checked={cfg.tablesEnabled} onChange={(v) => void toggle(v)} />
      </div>
      {cfg.tablesEnabled && !unlimited ? <TablesTrialNotice /> : null}
    </div>
  );
}

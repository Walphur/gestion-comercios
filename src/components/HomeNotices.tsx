import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardList, CreditCard, X } from "lucide-react";
import { Button, Card } from "./ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { usePlanEntitlements } from "../hooks/usePlanEntitlements";
import { listReorderSuggestions, type ReorderSuggestion } from "../db/purchaseOrders";
import { getSetting, setSetting } from "../db/settings";
import { getMpConfigStatus } from "../lib/posIntegrations";
import { formatQty, todayYmd } from "../lib/format";

const LOW_STOCK_HIDDEN_DAY_KEY = "walqo_low_stock_notice_hidden_day";
const MP_PROMO_DISMISSED_SETTING = "mp_promo_dismissed";

/** Avisos de Inicio: stock para reponer y, si falta, conectar Mercado Pago. */
export default function HomeNotices({ hasSales }: { hasSales: boolean }) {
  return (
    <div className="space-y-3 empty:hidden">
      <LowStockNotice />
      <MercadoPagoPromo hasSales={hasSales} />
    </div>
  );
}

function NoticeCard({
  tone,
  icon,
  title,
  detail,
  actions,
  onClose,
  closeLabel,
}: {
  tone: "amber" | "sky";
  icon: ReactNode;
  title: string;
  detail?: string;
  actions: ReactNode;
  onClose: () => void;
  closeLabel: string;
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-400/40 bg-amber-50/70 dark:bg-amber-950/25"
      : "border-sky-400/40 bg-sky-50/70 dark:bg-sky-950/25";
  return (
    <Card className={toneClass}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{title}</p>
            {detail && <p className="truncate text-xs text-ink-muted">{detail}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </Card>
  );
}

function hiddenToday(key: string): boolean {
  try {
    return localStorage.getItem(key) === todayYmd();
  } catch {
    return false;
  }
}

function LowStockNotice() {
  const { features, rubroDef } = useAppConfig();
  const { can, canViewStock } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<ReorderSuggestion[] | null>(null);
  const [hidden, setHidden] = useState(() => hiddenToday(LOW_STOCK_HIDDEN_DAY_KEY));

  const enabled =
    features.stock && rubroDef.id !== "clinica" && can("manage_products") && canViewStock && !hidden;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listReorderSuggestions()
      .then((rows) => {
        if (!cancelled) setItems(rows.filter((r) => r.pending_order_id == null));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || !items || items.length === 0) return null;

  const n = items.length;
  const names = items
    .slice(0, 3)
    .map((r) => `${r.name} (${r.stock > 0 ? `quedan ${formatQty(r.stock)}` : "agotado"})`)
    .join(", ");
  const detail = n > 3 ? `${names} y ${n - 3} más` : names;

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(LOW_STOCK_HIDDEN_DAY_KEY, todayYmd());
    } catch {
      /* sin almacenamiento: se oculta hasta reabrir */
    }
  }

  return (
    <NoticeCard
      tone="amber"
      icon={<AlertTriangle size={20} className="text-amber-700 dark:text-amber-300" />}
      title={n === 1 ? "1 producto con stock bajo" : `${n} productos con stock bajo`}
      detail={detail}
      closeLabel="Ocultar por hoy"
      onClose={hide}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => navigate("/stock?bajo=1")}>
            Ver
          </Button>
          <Button size="sm" onClick={() => navigate("/proveedores?tab=pedidos")}>
            <ClipboardList size={14} />
            Armar pedido
          </Button>
        </>
      }
    />
  );
}

function MercadoPagoPromo({ hasSales }: { hasSales: boolean }) {
  const { features, rubroDef } = useAppConfig();
  const { can } = useAuth();
  const { mercadoPago } = usePlanEntitlements();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  const enabled =
    hasSales && mercadoPago && features.pos && rubroDef.id !== "clinica" && can("manage_admin");

  useEffect(() => {
    if (!enabled) {
      setShow(false);
      return;
    }
    let cancelled = false;
    Promise.all([getSetting(MP_PROMO_DISMISSED_SETTING), getMpConfigStatus()])
      .then(([dismissed, mp]) => {
        if (cancelled) return;
        const connected = mp.configured || mp.oauth_connected || mp.simulation;
        setShow(dismissed !== "1" && mp.oauth_available && !connected);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    void setSetting(MP_PROMO_DISMISSED_SETTING, "1");
  }

  return (
    <NoticeCard
      tone="sky"
      icon={<CreditCard size={20} className="text-[#009ee3]" />}
      title="Cobrá con QR de Mercado Pago: el cobro se registra solo en la venta."
      detail="Tu cliente escanea, paga y WalQo lo anota. No tenés que cargar nada a mano."
      closeLabel="No mostrar más"
      onClose={dismiss}
      actions={
        <Button size="sm" onClick={() => navigate("/admin?section=mercadopago")}>
          Conectar
        </Button>
      }
    />
  );
}

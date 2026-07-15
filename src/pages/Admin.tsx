import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CreditCard,
  Lock,
  MessageCircle,
  Palette,
  Printer,
  Settings2,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  Wallet,
  Network,
} from "lucide-react";
import { PageHeader, Card, Button, Input, PageContent } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import AdminHubTile from "../components/admin/AdminHubTile";
import AdminAppearancePanel from "../components/admin/AdminAppearancePanel";
import AdminNegocioPanel from "../components/admin/AdminNegocioPanel";
import AdminCashPanel from "../components/admin/AdminCashPanel";
import AdminArcaPanel from "../components/admin/AdminArcaPanel";
import AdminMercadoPagoCard from "../components/admin/AdminMercadoPagoCard";
import AdminPrintingPanel from "../components/admin/AdminPrintingPanel";
import AdminUsersPanel from "../components/admin/AdminUsersPanel";
import AdminSystemPanel from "../components/admin/AdminSystemPanel";
import AdminWorkshopResourcesPanel from "../components/admin/AdminWorkshopResourcesPanel";
import AdminWhatsAppPanel from "../components/admin/AdminWhatsAppPanel";
import AdminLanSyncPanel from "../components/admin/AdminLanSyncPanel";
import { activeProModuleLabels } from "../config/modules";
import { rubroUsesAppointmentResources } from "../config/workshop";
import { getResourceLabels } from "../config/resourceLabels";

type SectionId =
  | "hub"
  | "business"
  | "cash"
  | "printing"
  | "arca"
  | "mercadopago"
  | "users"
  | "team"
  | "whatsapp"
  | "appearance"
  | "system"
  | "lan-sync";

const SECTION_IDS = new Set<string>([
  "hub",
  "business",
  "cash",
  "printing",
  "arca",
  "mercadopago",
  "users",
  "team",
  "whatsapp",
  "appearance",
  "system",
  "lan-sync",
  "invoicing",
  "backups",
  "advanced",
]);

function parseSection(value: string | null): SectionId {
  if (value === "invoicing") return "arca";
  if (value === "backups" || value === "advanced") return "system";
  if (value && SECTION_IDS.has(value) && value !== "hub") {
    return value as Exclude<SectionId, "hub">;
  }
  return "hub";
}

const SECTION_TITLES: Record<Exclude<SectionId, "hub">, string> = {
  business: "Negocio",
  cash: "Caja",
  printing: "Impresión",
  arca: "ARCA / AFIP",
  mercadopago: "Mercado Pago",
  users: "Usuarios",
  team: "Personal",
  whatsapp: "WhatsApp turnos",
  appearance: "Apariencia",
  system: "Sistema",
  "lan-sync": "Sincronización LAN",
};

export default function Admin() {
  const cfg = useAppConfig();
  const { user, elevatedAdmin, elevateAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [savedFlash, setSavedFlash] = useState("");
  const [section, setSection] = useState<SectionId>(() => parseSection(searchParams.get("section")));

  useEffect(() => {
    if (elevatedAdmin) {
      setUnlocked(true);
      setSection(parseSection(searchParams.get("section")));
    } else {
      setUnlocked(false);
      setSection("hub");
    }
    setPin("");
    setPinError(false);
  }, [user?.id, elevatedAdmin, searchParams]);

  function goToSection(next: SectionId) {
    setSection(next);
    if (next === "hub") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ section: next }, { replace: true });
    }
  }

  function tryUnlock() {
    if (pin === cfg.adminPin) {
      setUnlocked(true);
      setPinError(false);
      elevateAdmin();
      setSection(parseSection(searchParams.get("section")));
    } else {
      setPinError(true);
    }
  }

  function flash(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(""), 1500);
  }

  const resourceLabels = getResourceLabels(cfg.rubro);
  const showTeamSection = cfg.proPlanEnabled && rubroUsesAppointmentResources(cfg.rubro);
  const showWhatsAppSection = cfg.isProModuleActive("appointments");
  const showInvoicingHub = cfg.features.invoicing;
  const proModulesLabel = activeProModuleLabels(cfg.proPlanEnabled, cfg.proModules).join(", ");

  if (!unlocked) {
    return (
      <PageContent narrow className="flex h-full items-center justify-center">
        <Card variant="elevated" className="w-full max-w-sm">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 dark:bg-brand-900/50">
              <Lock className="text-brand-600 dark:text-brand-300" size={26} />
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight text-ink">Configuración</h2>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-ink-muted">
              Ingresá el PIN de administrador para continuar.
            </p>
            <Input
              type="password"
              label="PIN de administrador"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setPinError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              placeholder="••••"
              className="text-center"
              error={pinError ? "PIN incorrecto. Intentá de nuevo." : undefined}
              autoFocus
            />
            <Button onClick={tryUnlock} className="mt-5 w-full">
              Ingresar
            </Button>
          </div>
        </Card>
      </PageContent>
    );
  }

  if (section !== "hub") {
    const title =
      section === "team" ? resourceLabels.sectionTitle : SECTION_TITLES[section];
    return (
      <div>
        <PageHeader
          title={title}
          subtitle="Configuración del comercio"
          actions={
            savedFlash ? (
              <span className="flex items-center gap-1 text-sm font-medium text-green-600">
                <Check size={16} /> {savedFlash}
              </span>
            ) : undefined
          }
        />
        <PageContent narrow>
          <Button variant="ghost" className="mb-4 -ml-2" onClick={() => goToSection("hub")}>
            <ArrowLeft size={16} /> Volver
          </Button>
          {section === "business" && (
            <Card variant="elevated">
              <AdminNegocioPanel onFlash={flash} />
            </Card>
          )}
          {section === "cash" && <AdminCashPanel onFlash={flash} />}
          {section === "printing" && <AdminPrintingPanel onFlash={flash} />}
          {section === "arca" && <AdminArcaPanel onFlash={flash} />}
          {section === "mercadopago" && <AdminMercadoPagoCard onFlash={flash} />}
          {section === "users" && <AdminUsersPanel />}
          {section === "team" && showTeamSection && (
            <Card variant="elevated">
              <AdminWorkshopResourcesPanel />
            </Card>
          )}
          {section === "whatsapp" && showWhatsAppSection && (
            <Card variant="elevated">
              <AdminWhatsAppPanel onFlash={flash} />
            </Card>
          )}
          {section === "appearance" && (
            <Card variant="elevated">
              <AdminAppearancePanel onFlash={flash} />
            </Card>
          )}
          {section === "system" && (
            <Card variant="elevated">
              <AdminSystemPanel onFlash={flash} />
            </Card>
          )}
          {section === "lan-sync" && (
            <Card variant="elevated">
              <AdminLanSyncPanel onFlash={flash} />
            </Card>
          )}
        </PageContent>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Elegí qué querés ajustar."
        actions={
          savedFlash ? (
            <span className="flex items-center gap-1 text-sm font-medium text-green-600">
              <Check size={16} /> {savedFlash}
            </span>
          ) : undefined
        }
      />

      <PageContent narrow className="space-y-3">
        <AdminHubTile
          icon={Store}
          title="Negocio"
          summary={`${cfg.businessName} · ${cfg.rubroDef.label}`}
          onClick={() => goToSection("business")}
        />
        <AdminHubTile
          icon={Wallet}
          title="Caja"
          summary="PIN de administrador y arqueos de turno"
          onClick={() => goToSection("cash")}
        />
        <AdminHubTile
          icon={Printer}
          title="Impresión"
          summary="Ticket y cajón de dinero"
          onClick={() => goToSection("printing")}
        />
        {showInvoicingHub && (
          <AdminHubTile
            icon={ShieldCheck}
            title="ARCA / AFIP"
            summary="Certificado, facturación automática y conexión"
            onClick={() => goToSection("arca")}
          />
        )}
        <AdminHubTile
          icon={CreditCard}
          title="Mercado Pago"
          summary="Cobro con QR en el punto de venta"
          onClick={() => goToSection("mercadopago")}
        />
        <AdminHubTile
          icon={UserCog}
          title="Usuarios"
          summary="Empleados, roles y permisos"
          onClick={() => goToSection("users")}
        />
        {showTeamSection && (
          <AdminHubTile
            icon={Users}
            title={resourceLabels.sectionTitle}
            summary={resourceLabels.sectionSubtitle}
            badge="Pro"
            onClick={() => goToSection("team")}
          />
        )}
        {showWhatsAppSection && (
          <AdminHubTile
            icon={MessageCircle}
            title="WhatsApp turnos"
            summary="Recordatorios automáticos y confirmación por botones"
            badge="Pro"
            onClick={() => goToSection("whatsapp")}
          />
        )}
        <AdminHubTile
          icon={Palette}
          title="Apariencia"
          summary="Tema, logo y datos para imprimir"
          onClick={() => goToSection("appearance")}
        />
        <AdminHubTile
          icon={Network}
          title="Sincronización LAN"
          summary="Oficina + cajas en la misma red · cambios en tiempo real · sin internet"
          onClick={() => goToSection("lan-sync")}
        />
        <AdminHubTile
          icon={Settings2}
          title="Sistema"
          summary={
            cfg.proPlanEnabled
              ? `Actualizaciones, copias de seguridad y menú · Pro · ${proModulesLabel || "módulos activos"}`
              : "Actualizaciones, copias de seguridad y opciones del menú"
          }
          badge={cfg.proPlanEnabled ? "Pro" : "Básico"}
          onClick={() => goToSection("system")}
        />
      </PageContent>
    </div>
  );
}

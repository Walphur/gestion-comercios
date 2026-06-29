import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Cloud,
  FileText,
  Lock,
  Palette,
  Printer,
  Settings2,
  SlidersHorizontal,
  Store,
  UserCog,
  Wallet,
} from "lucide-react";
import { PageHeader, Card, Button, Input, PageContent } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import AdminHubTile from "../components/admin/AdminHubTile";
import AdminAppearancePanel from "../components/admin/AdminAppearancePanel";
import AdminNegocioPanel from "../components/admin/AdminNegocioPanel";
import AdminCashPanel from "../components/admin/AdminCashPanel";
import AdminInvoicingPanel from "../components/admin/AdminInvoicingPanel";
import AdminPrintingPanel from "../components/admin/AdminPrintingPanel";
import AdminUsersPanel from "../components/admin/AdminUsersPanel";
import AdminBackupsPanel from "../components/admin/AdminBackupsPanel";
import AdminSystemPanel from "../components/admin/AdminSystemPanel";
import AdminAdvancedPanel from "../components/admin/AdminAdvancedPanel";
import { activeProModuleLabels } from "../config/modules";

type SectionId =
  | "hub"
  | "business"
  | "cash"
  | "printing"
  | "invoicing"
  | "users"
  | "appearance"
  | "backups"
  | "system"
  | "advanced";

const SECTION_IDS = new Set<string>([
  "hub",
  "business",
  "cash",
  "printing",
  "invoicing",
  "users",
  "appearance",
  "backups",
  "system",
  "advanced",
]);

function parseSection(value: string | null): SectionId {
  if (value && SECTION_IDS.has(value) && value !== "hub") {
    return value as Exclude<SectionId, "hub">;
  }
  return "hub";
}

const SECTION_TITLES: Record<Exclude<SectionId, "hub">, string> = {
  business: "Negocio",
  cash: "Caja",
  printing: "Impresión",
  invoicing: "Facturación",
  users: "Usuarios",
  appearance: "Apariencia",
  backups: "Copias de seguridad",
  system: "Sistema",
  advanced: "Opciones avanzadas",
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

  const proModulesLabel = activeProModuleLabels(cfg.proPlanEnabled, cfg.proModules).join(", ");

  if (!unlocked) {
    return (
      <PageContent narrow className="flex h-full items-center justify-center">
        <Card className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/50">
            <Lock className="text-ink-muted" />
          </div>
          <h2 className="text-lg font-semibold text-ink">Configuración</h2>
          <p className="mb-4 mt-1 text-sm text-ink-muted">
            Ingresá el PIN de administrador para continuar.
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
      </PageContent>
    );
  }

  if (section !== "hub") {
    const title = SECTION_TITLES[section];
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
            <Card>
              <AdminNegocioPanel onFlash={flash} />
            </Card>
          )}
          {section === "cash" && <AdminCashPanel onFlash={flash} />}
          {section === "printing" && <AdminPrintingPanel onFlash={flash} />}
          {section === "invoicing" && <AdminInvoicingPanel onFlash={flash} />}
          {section === "users" && <AdminUsersPanel />}
          {section === "appearance" && (
            <Card>
              <AdminAppearancePanel onFlash={flash} />
            </Card>
          )}
          {section === "backups" && (
            <Card>
              <AdminBackupsPanel onFlash={flash} />
            </Card>
          )}
          {section === "system" && (
            <Card>
              <AdminSystemPanel onFlash={flash} />
            </Card>
          )}
          {section === "advanced" && <AdminAdvancedPanel />}
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
        <AdminHubTile
          icon={FileText}
          title="Facturación"
          summary="Comprobantes fiscales y Mercado Pago"
          onClick={() => goToSection("invoicing")}
        />
        <AdminHubTile
          icon={UserCog}
          title="Usuarios"
          summary="Empleados, roles y permisos"
          onClick={() => goToSection("users")}
        />
        <AdminHubTile
          icon={Palette}
          title="Apariencia"
          summary="Tema, colores y logo"
          onClick={() => goToSection("appearance")}
        />
        <AdminHubTile
          icon={Cloud}
          title="Copias de seguridad"
          summary="Guardar y restaurar tus datos"
          onClick={() => goToSection("backups")}
        />
        <AdminHubTile
          icon={Settings2}
          title="Sistema"
          summary={
            cfg.proPlanEnabled
              ? `Plan Pro · ${proModulesLabel || "módulos activos"}`
              : "Plan Básico · actualizaciones y soporte"
          }
          badge={cfg.proPlanEnabled ? "Pro" : "Básico"}
          onClick={() => goToSection("system")}
        />
        <AdminHubTile
          icon={SlidersHorizontal}
          title="Opciones avanzadas"
          summary="Mostrar u ocultar secciones del menú"
          onClick={() => goToSection("advanced")}
        />
      </PageContent>
    </div>
  );
}

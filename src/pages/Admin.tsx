import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Cloud,
  Lock,
  Package,
  Palette,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Store,
} from "lucide-react";
import { PageHeader, Card, Button, Input } from "../components/ui";
import { useAppConfig } from "../context/AppConfig";
import AdminHubTile from "../components/admin/AdminHubTile";
import AdminAppearancePanel from "../components/admin/AdminAppearancePanel";
import AdminRubroPanel from "../components/AdminRubroPanel";
import AdminModulesPanel from "../components/AdminModulesPanel";
import AdminBusinessPanel from "../components/admin/AdminBusinessPanel";
import AdminCatalogPanel from "../components/admin/AdminCatalogPanel";
import AdminSystemPanel from "../components/admin/AdminSystemPanel";
import AdminAdvancedPanel from "../components/admin/AdminAdvancedPanel";
import { activeProModuleLabels } from "../config/modules";

type SectionId =
  | "hub"
  | "appearance"
  | "rubro"
  | "plan"
  | "business"
  | "catalog"
  | "system"
  | "advanced";

const SECTION_TITLES: Record<Exclude<SectionId, "hub">, string> = {
  appearance: "Apariencia",
  rubro: "Rubro del negocio",
  plan: "Plan y módulos",
  business: "Negocio y caja",
  catalog: "Catálogo de productos",
  system: "Sistema y respaldos",
  advanced: "Opciones avanzadas",
};

export default function Admin() {
  const cfg = useAppConfig();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [savedFlash, setSavedFlash] = useState("");
  const [section, setSection] = useState<SectionId>("hub");

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

  const proModulesLabel = activeProModuleLabels(cfg.proPlanEnabled, cfg.proModules).join(", ");

  if (!unlocked) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/50">
            <Lock className="text-ink-muted" />
          </div>
          <h2 className="text-lg font-semibold text-ink">Acceso de administrador</h2>
          <p className="mb-4 mt-1 text-sm text-ink-muted">
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

  if (section !== "hub") {
    const title = SECTION_TITLES[section];
    return (
      <div>
        <PageHeader
          title={title}
          subtitle="Configuración del comercio"
          actions={
            savedFlash ? (
              <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                <Check size={16} /> {savedFlash}
              </span>
            ) : undefined
          }
        />
        <div className="mx-auto max-w-2xl p-8">
          <Button variant="ghost" className="mb-4 -ml-2" onClick={() => setSection("hub")}>
            <ArrowLeft size={16} /> Volver a configuración
          </Button>
          <Card>
            {section === "appearance" && <AdminAppearancePanel onFlash={flash} />}
            {section === "rubro" && (
              <>
                <p className="mb-4 text-sm text-ink-muted">
                  Elegí el tipo de negocio. Ajusta menús y textos de la app.
                </p>
                <AdminRubroPanel onFlash={flash} />
              </>
            )}
            {section === "plan" && <AdminModulesPanel onFlash={flash} />}
            {section === "business" && <AdminBusinessPanel onFlash={flash} />}
            {section === "catalog" && <AdminCatalogPanel onFlash={flash} />}
            {section === "system" && <AdminSystemPanel onFlash={flash} />}
            {section === "advanced" && <AdminAdvancedPanel />}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Administración"
        subtitle="Elegí qué querés configurar."
        actions={
          savedFlash ? (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <Check size={16} /> {savedFlash}
            </span>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-2xl space-y-3 p-8">
        <AdminHubTile
          icon={Palette}
          title="Apariencia"
          summary={`${cfg.businessName} · tema, colores, logo y moneda`}
          onClick={() => setSection("appearance")}
        />
        <AdminHubTile
          icon={Store}
          title="Rubro"
          summary={cfg.rubroDef.label}
          badge={cfg.rubroDef.planHint === "pro" ? "Pro" : undefined}
          onClick={() => setSection("rubro")}
        />
        <AdminHubTile
          icon={Sparkles}
          title="Plan Pro o Básico"
          summary={
            cfg.proPlanEnabled
              ? `Pro · ${proModulesLabel || "activá módulos abajo"}`
              : "Plan Básico · POS, productos, stock y clientes"
          }
          badge={cfg.proPlanEnabled ? "Pro" : "Básico"}
          onClick={() => setSection("plan")}
        />
        <AdminHubTile
          icon={Settings2}
          title="Negocio y caja"
          summary="PIN admin, facturación ARCA y arqueos"
          onClick={() => setSection("business")}
        />
        <AdminHubTile
          icon={Package}
          title="Catálogo"
          summary="Productos demo y catálogo supermercado"
          onClick={() => setSection("catalog")}
        />
        <AdminHubTile
          icon={Cloud}
          title="Sistema"
          summary="Actualizaciones, sync entre PCs, backup y base de datos"
          onClick={() => setSection("system")}
        />
        <AdminHubTile
          icon={SlidersHorizontal}
          title="Avanzado"
          summary="Mostrar u ocultar secciones del menú"
          onClick={() => setSection("advanced")}
        />
      </div>
    </div>
  );
}

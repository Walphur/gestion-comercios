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
  ShieldCheck,
  ShoppingBag,
  Store,
  UserCog,
  Users,
  Wallet,
  Network,
  Globe,
  HardDrive,
  LifeBuoy,
  Puzzle,
  QrCode,
  UtensilsCrossed,
} from "lucide-react";
import { PageHeader, Card, Button, Input, PageContent } from "../components/ui";
import AppVersionLabel from "../components/AppVersionLabel";
import { useAppConfig } from "../context/AppConfig";
import { useAuth } from "../context/AuthContext";
import { verifyAdminUnlockPin } from "../db/users";
import { checkAndInstallUpdate } from "../lib/updater";
import { openExternalUrl } from "../lib/openExternal";
import AdminHubTile from "../components/admin/AdminHubTile";
import AdminAppearancePanel from "../components/admin/AdminAppearancePanel";
import AdminNegocioPanel from "../components/admin/AdminNegocioPanel";
import AdminPosPanel from "../components/admin/AdminPosPanel";
import AdminCashPanel from "../components/admin/AdminCashPanel";
import AdminArcaPanel from "../components/admin/AdminArcaPanel";
import AdminMercadoPagoCard from "../components/admin/AdminMercadoPagoCard";
import AdminPaywayCard from "../components/admin/AdminPaywayCard";
import AdminTiendaNubeCard from "../components/admin/AdminTiendaNubeCard";
import AdminPrintingPanel from "../components/admin/AdminPrintingPanel";
import AdminUsersPanel from "../components/admin/AdminUsersPanel";
import AdminSystemPanel from "../components/admin/AdminSystemPanel";
import AdminBackupsPanel from "../components/admin/AdminBackupsPanel";
import AdminModulesPanel from "../components/AdminModulesPanel";
import AdminAdvancedPanel from "../components/admin/AdminAdvancedPanel";
import AdminWorkshopSyncPanel from "../components/AdminWorkshopSyncPanel";
import AdminWorkshopResourcesPanel from "../components/admin/AdminWorkshopResourcesPanel";
import AdminWhatsAppPanel from "../components/admin/AdminWhatsAppPanel";
import AdminLanSyncPanel from "../components/admin/AdminLanSyncPanel";
import AdminOwnerPortalPanel from "../components/admin/AdminOwnerPortalPanel";
import AdminWorkshopPortalPanel from "../components/admin/AdminWorkshopPortalPanel";
import AdminMenuPortalPanel from "../components/admin/AdminMenuPortalPanel";
import { rubroUsesAppointmentResources, rubroUsesWorkshopFlow } from "../config/workshop";
import { getResourceLabels } from "../config/resourceLabels";

type SectionId =
  | "hub"
  | "business"
  | "cash"
  | "printing"
  | "arca"
  | "mercadopago"
  | "payway"
  | "tiendanube"
  | "users"
  | "team"
  | "whatsapp"
  | "appearance"
  | "system"
  | "backups"
  | "features"
  | "lan-sync"
  | "owner-portal"
  | "workshop-portal"
  | "menu-portal";

const SECTION_IDS = new Set<string>([
  "hub",
  "business",
  "cash",
  "printing",
  "arca",
  "mercadopago",
  "payway",
  "tiendanube",
  "users",
  "team",
  "whatsapp",
  "appearance",
  "system",
  "backups",
  "features",
  "lan-sync",
  "owner-portal",
  "workshop-portal",
  "menu-portal",
  "invoicing",
  "backups",
  "advanced",
]);

function parseSection(value: string | null): SectionId {
  if (value === "invoicing") return "arca";
  if (value === "advanced") return "system";
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
  payway: "Payway QR",
  tiendanube: "Tienda Nube",
  users: "Usuarios",
  team: "Personal",
  whatsapp: "WhatsApp turnos",
  appearance: "Apariencia",
  system: "Ayuda y soporte",
  backups: "Copias de seguridad",
  features: "Funciones adicionales",
  "lan-sync": "Varias computadoras",
  "owner-portal": "Panel web del dueño",
  "workshop-portal": "Portal web del cliente",
  "menu-portal": "Carta web pública",
};

export default function Admin() {
  const cfg = useAppConfig();
  const { user, elevatedAdmin, elevateAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [unlockHint, setUnlockHint] = useState("");
  const [updating, setUpdating] = useState(false);
  const [savedFlash, setSavedFlash] = useState("");
  const [section, setSection] = useState<SectionId>(() => parseSection(searchParams.get("section")));

  useEffect(() => {
    // Si ya entró como Administrador, no pedir un segundo PIN distinto.
    if (user?.role === "admin" || elevatedAdmin) {
      setUnlocked(true);
      setSection(parseSection(searchParams.get("section")));
    } else {
      setUnlocked(false);
      setSection("hub");
    }
    setPin("");
    setPinError(false);
    setUnlockHint("");
  }, [user?.id, user?.role, elevatedAdmin, searchParams]);

  function goToSection(next: SectionId) {
    setSection(next);
    if (next === "hub") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ section: next }, { replace: true });
    }
  }

  async function tryUnlock() {
    setUnlockHint("");
    const ok = await verifyAdminUnlockPin(pin);
    if (ok) {
      setUnlocked(true);
      setPinError(false);
      elevateAdmin();
      setSection(parseSection(searchParams.get("section")));
      return;
    }
    // Fallback: el setting en memoria (ya sincronizado con el admin al cargar).
    if (pin.trim() && pin.trim() === cfg.adminPin.trim()) {
      setUnlocked(true);
      setPinError(false);
      elevateAdmin();
      setSection(parseSection(searchParams.get("section")));
      return;
    }
    setPinError(true);
    if (user && user.role !== "admin") {
      setUnlockHint(
        "Tip: cerrá sesión e ingresá como Administrador (no como Cajero). Ahí Configuración abre sin pedir otro PIN.",
      );
    }
  }

  async function handleForceUpdate() {
    setUpdating(true);
    setUnlockHint("Buscando actualización…");
    try {
      const r = await checkAndInstallUpdate(true, { autoUpdates: true });
      setUnlockHint(r.message || "Listo.");
    } catch (e) {
      setUnlockHint(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdating(false);
    }
  }

  function flash(msg: string) {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(""), 1500);
  }

  const resourceLabels = getResourceLabels(cfg.rubro);
  const showTeamSection = cfg.proPlanEnabled && rubroUsesAppointmentResources(cfg.rubro);
  const showWorkshopPortalSection = rubroUsesWorkshopFlow(cfg.rubro);
  const showMenuPortalSection = cfg.rubro === "gastronomia";
  const showWhatsAppSection = cfg.isProModuleActive("appointments");
  const showInvoicingHub = cfg.features.invoicing;

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
              Ingresá el PIN del usuario <strong className="text-ink">Administrador</strong> (el
              mismo con el que iniciás sesión).
            </p>
            <Input
              type="password"
              label="PIN de administrador"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setPinError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && void tryUnlock()}
              placeholder="••••"
              className="text-center"
              error={
                pinError
                  ? "PIN incorrecto. Usá el mismo PIN del empleado Administrador."
                  : undefined
              }
              autoFocus
            />
            <Button onClick={() => void tryUnlock()} className="mt-5 w-full">
              Ingresar
            </Button>
            {unlockHint ? (
              <p className="mt-3 text-left text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                {unlockHint}
              </p>
            ) : null}
            <div className="mt-4 space-y-2 border-t border-[var(--color-panel-border)] pt-4">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={updating}
                onClick={() => void handleForceUpdate()}
              >
                {updating ? "Actualizando…" : "Buscar e instalar actualización"}
              </Button>
              <button
                type="button"
                className="w-full text-xs font-medium text-ink-muted underline-offset-2 hover:underline"
                onClick={() =>
                  void openExternalUrl(
                    "https://github.com/Walphur/gestion-comercios/releases/latest",
                  )
                }
              >
                O descargar instalador desde la web
              </button>
              <div className="pt-1">
                <AppVersionLabel />
              </div>
            </div>
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
            <>
              <Card variant="elevated" className="mb-6">
                <AdminNegocioPanel onFlash={flash} />
              </Card>
              <Card variant="elevated">
                <AdminPosPanel onFlash={flash} />
              </Card>
            </>
          )}
          {section === "cash" && <AdminCashPanel onFlash={flash} />}
          {section === "printing" && <AdminPrintingPanel onFlash={flash} />}
          {section === "arca" && <AdminArcaPanel onFlash={flash} />}
          {section === "mercadopago" && <AdminMercadoPagoCard onFlash={flash} />}
          {section === "payway" && <AdminPaywayCard onFlash={flash} />}
          {section === "tiendanube" && <AdminTiendaNubeCard onFlash={flash} />}
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
          {section === "backups" && <AdminBackupsPanel onFlash={flash} />}
          {section === "features" && (
            <div className="space-y-4">
              <AdminModulesPanel onFlash={flash} />
              {rubroUsesWorkshopFlow(cfg.rubro) && <AdminWorkshopSyncPanel onFlash={flash} />}
              <AdminAdvancedPanel embedded />
            </div>
          )}
          {section === "lan-sync" && (
            <Card variant="elevated">
              <AdminLanSyncPanel onFlash={flash} />
            </Card>
          )}
          {section === "owner-portal" && (
            <Card variant="elevated">
              <AdminOwnerPortalPanel onFlash={flash} />
            </Card>
          )}
          {section === "workshop-portal" && showWorkshopPortalSection && (
            <Card variant="elevated">
              <AdminWorkshopPortalPanel businessName={cfg.businessName} onFlash={flash} />
            </Card>
          )}
          {section === "menu-portal" && showMenuPortalSection && (
            <Card variant="elevated">
              <AdminMenuPortalPanel businessName={cfg.businessName} onFlash={flash} />
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
        subtitle="Ajustá el comercio. Lo técnico está en Ayuda y soporte."
        actions={
          savedFlash ? (
            <span className="flex items-center gap-1 text-sm font-medium text-green-600">
              <Check size={16} /> {savedFlash}
            </span>
          ) : undefined
        }
      />

      <PageContent narrow className="space-y-6">
        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Mi comercio
          </h3>
          <AdminHubTile
            icon={Store}
            title="Datos del comercio"
            summary={`${cfg.businessName} · ${cfg.rubroDef.label}`}
            onClick={() => goToSection("business")}
          />
          <AdminHubTile
            icon={Palette}
            title="Apariencia"
            summary="Colores, logo y cómo se ve el ticket"
            onClick={() => goToSection("appearance")}
          />
          <AdminHubTile
            icon={Wallet}
            title="Caja"
            summary="Recargos, PIN y cierre del turno"
            onClick={() => goToSection("cash")}
          />
          <AdminHubTile
            icon={Printer}
            title="Impresión y tickets"
            summary="Etiquetas y ticket de la venta"
            onClick={() => goToSection("printing")}
          />
        </section>

        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Usuarios y acceso
          </h3>
          <AdminHubTile
            icon={UserCog}
            title="Usuarios"
            summary="Quién puede vender, cobrar o ver reportes"
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
        </section>

        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Conexiones
          </h3>
          {showInvoicingHub && (
            <AdminHubTile
              icon={ShieldCheck}
              title="Facturación"
              summary="Conectá ARCA para emitir facturas"
              onClick={() => goToSection("arca")}
            />
          )}
          <AdminHubTile
            icon={CreditCard}
            title="Mercado Pago"
            summary="Cobrá con QR en el punto de venta"
            onClick={() => goToSection("mercadopago")}
          />
          <AdminHubTile
            icon={QrCode}
            title="Payway"
            summary="QR de otros bancos y billeteras"
            onClick={() => goToSection("payway")}
          />
          <AdminHubTile
            icon={ShoppingBag}
            title="Tienda Nube"
            summary="Productos y stock de tu tienda online"
            onClick={() => goToSection("tiendanube")}
          />
          {showWhatsAppSection && (
            <AdminHubTile
              icon={MessageCircle}
              title="WhatsApp de turnos"
              summary="Avisos y confirmación de turnos"
              badge="Pro"
              onClick={() => goToSection("whatsapp")}
            />
          )}
          <AdminHubTile
            icon={Network}
            title="Varias computadoras"
            summary="La oficina y las cajas ven los mismos datos, sin internet"
            onClick={() => goToSection("lan-sync")}
          />
          <AdminHubTile
            icon={Globe}
            title="Ver el comercio desde el celular"
            summary="Ventas y stock en walqo.pro, solo para mirar"
            onClick={() => goToSection("owner-portal")}
          />
          {showWorkshopPortalSection && (
            <AdminHubTile
              icon={QrCode}
              title="Página para el cliente"
              summary="El cliente ve su historial con un QR"
              onClick={() => goToSection("workshop-portal")}
            />
          )}
          {showMenuPortalSection && (
            <AdminHubTile
              icon={UtensilsCrossed}
              title="Carta online"
              summary="Precios publicados y pedido por WhatsApp"
              onClick={() => goToSection("menu-portal")}
            />
          )}
        </section>

        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Copias y funciones
          </h3>
          <AdminHubTile
            icon={HardDrive}
            title="Copias de seguridad"
            summary="WalQo guarda tus datos. También podés hacer una copia ahora."
            onClick={() => goToSection("backups")}
          />
          <AdminHubTile
            icon={Puzzle}
            title="Funciones adicionales"
            summary={
              cfg.proPlanEnabled
                ? "Tu plan y qué secciones querés ver"
                : "Tu plan y qué secciones querés ver en el menú"
            }
            onClick={() => goToSection("features")}
          />
        </section>

        <section className="space-y-2">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Ayuda
          </h3>
          <AdminHubTile
            icon={LifeBuoy}
            title="Ayuda y soporte"
            summary="Contacto, versión de WalQo y opciones para soporte"
            onClick={() => goToSection("system")}
          />
        </section>
      </PageContent>
    </div>
  );
}

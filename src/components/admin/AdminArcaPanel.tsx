import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  CircleSlash,
  FileKey,
  FileText,
  Loader2,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Alert, Button, Card, Input, SegmentToggle } from "../ui";
import CollapsibleGuide from "../CollapsibleGuide";
import { getSetting, setSetting } from "../../db/settings";
import {
  arcaConsultarUltimoComprobante,
  arcaGuardarConfig,
  arcaObtenerConfig,
  arcaObtenerEstado,
  arcaPickPemFile,
  arcaProbarConexion,
  arcaRenovarToken,
  arcaSetSimulacion,
  arcaValidarInstalacion,
  type ArcaEstado,
  type ArcaInstallReport,
  type ArcaTestResult,
} from "../../lib/arca";

interface Props {
  onFlash: (msg: string) => void;
}

function formatTokenExpiry(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AdminArcaPanel({ onFlash }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [estadoLoading, setEstadoLoading] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [fiscalEnabled, setFiscalEnabled] = useState(false);

  const [cuit, setCuit] = useState("");
  const [puntoVenta, setPuntoVenta] = useState("1");
  const [produccion, setProduccion] = useState(false);
  const [simulacion, setSimulacion] = useState(false);

  const [certPem, setCertPem] = useState<string | null>(null);
  const [keyPem, setKeyPem] = useState<string | null>(null);
  const [certName, setCertName] = useState<string | null>(null);
  const [keyName, setKeyName] = useState<string | null>(null);
  const [certStored, setCertStored] = useState(false);
  const [keyStored, setKeyStored] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArcaTestResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [report, setReport] = useState<ArcaInstallReport | null>(null);
  const [estado, setEstado] = useState<ArcaEstado | null>(null);
  const [ultimoCbte, setUltimoCbte] = useState<string | null>(null);

  const refreshEstado = useCallback(async () => {
    setEstadoLoading(true);
    try {
      const e = await arcaObtenerEstado();
      setEstado(e);
      setSimulacion(e.simulacion);
    } catch (e) {
      setError(String(e));
    } finally {
      setEstadoLoading(false);
    }
  }, []);

  useEffect(() => {
    getSetting("fiscal_enabled").then((v) => setFiscalEnabled(v === "1"));
    arcaObtenerConfig()
      .then((cfg) => {
        setCuit(cfg.cuit ?? "");
        setPuntoVenta(String(cfg.punto_venta || 1));
        setProduccion(cfg.ambiente === "prod");
        setCertStored(cfg.cert_cargado);
        setKeyStored(cfg.key_cargada);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));

    void refreshEstado();
  }, [refreshEstado]);

  async function pickFile(kind: "cert" | "key") {
    setError(null);
    try {
      const picked = await arcaPickPemFile(kind);
      if (!picked) return;
      if (kind === "cert") {
        setCertPem(picked.pem);
        setCertName(picked.file_name);
      } else {
        setKeyPem(picked.pem);
        setKeyName(picked.file_name);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function save() {
    setError(null);
    setResult(null);
    const cuitDigits = cuit.replace(/\D/g, "");
    if (cuitDigits.length !== 11) {
      setError("El CUIT debe tener 11 dígitos.");
      return;
    }
    const pv = Number(puntoVenta);
    if (!Number.isInteger(pv) || pv <= 0) {
      setError("El punto de venta debe ser un número mayor a cero.");
      return;
    }
    setSaving(true);
    try {
      await arcaGuardarConfig({
        cuit: cuitDigits,
        puntoVenta: pv,
        ambiente: produccion ? "prod" : "homo",
        certPem,
        keyPem,
      });
      if (certPem) setCertStored(true);
      if (keyPem) setKeyStored(true);
      setCertPem(null);
      setKeyPem(null);
      setCertName(null);
      setKeyName(null);
      onFlash("Configuración de ARCA guardada");
      await refreshEstado();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setError(null);
    setResult(null);
    setReport(null);
    setTesting(true);
    try {
      const r = await arcaProbarConexion();
      setResult(r);
      await refreshEstado();
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  }

  async function validate() {
    setError(null);
    setResult(null);
    setReport(null);
    setValidating(true);
    try {
      const r = await arcaValidarInstalacion();
      setReport(r);
      await refreshEstado();
    } catch (e) {
      setError(String(e));
    } finally {
      setValidating(false);
    }
  }

  async function renewToken() {
    setError(null);
    setRenewing(true);
    try {
      const expira = await arcaRenovarToken();
      onFlash(`Token renovado. Válido hasta ${formatTokenExpiry(expira)}`);
      await refreshEstado();
    } catch (e) {
      setError(String(e));
    } finally {
      setRenewing(false);
    }
  }

  async function consultUltimo() {
    setError(null);
    setConsulting(true);
    try {
      const nro = await arcaConsultarUltimoComprobante();
      setUltimoCbte(nro);
      onFlash(`Último comprobante en ARCA: ${nro}`);
      await refreshEstado();
    } catch (e) {
      setError(String(e));
    } finally {
      setConsulting(false);
    }
  }

  async function toggleSimulacion(v: boolean) {
    setError(null);
    try {
      await arcaSetSimulacion(v);
      setSimulacion(v);
      onFlash(v ? "Modo simulación activado" : "Modo simulación desactivado");
      await refreshEstado();
    } catch (e) {
      setError(String(e));
    }
  }

  const certReady = certPem !== null || certStored;
  const keyReady = keyPem !== null || keyStored;
  const conectado = estado?.conectado || estado?.token_valido;

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={16} className="animate-spin" /> Cargando configuración…
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <FileText size={18} className="text-brand-600" />
          Facturación automática
        </h3>
        <p className="mb-4 text-sm text-ink-muted">
          Al activar, cada venta con el interruptor encendido emite el comprobante en ARCA cuando hay
          internet.
        </p>
        <SegmentToggle
          value={fiscalEnabled}
          onChange={async (v) => {
            setFiscalEnabled(v);
            await setSetting("fiscal_enabled", v ? "1" : "0");
            onFlash(v ? "Facturación activada" : "Facturación desactivada");
          }}
        />
      </Card>

      <CollapsibleGuide
        title="¿Cómo conectar ARCA paso a paso?"
        steps={[
          "En AFIP, con tu clave fiscal, generá el certificado para «Computador fiscal» (web services).",
          "Descargá el archivo de certificado (.crt o .pem) y la clave privada (.key).",
          "Acá cargá tu CUIT, el punto de venta habilitado en AFIP y subí ambos archivos.",
          "Dejá el ambiente en Homologación, guardá y pulsá «Probar conexión».",
          "Cuando todo esté OK, pasá a Producción, activá la facturación automática y probá una venta.",
        ]}
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${conectado ? "bg-green-500" : "bg-amber-500"}`}
                aria-hidden
              />
              ARCA
            </h3>
            <p className="text-sm text-ink-muted">
              {conectado ? "Conectado" : "Sin conexión activa"}
              {estado?.simulacion && " · Modo simulación"}
            </p>
          </div>
          <Button variant="secondary" onClick={() => void refreshEstado()} disabled={estadoLoading}>
            {estadoLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Actualizar
          </Button>
        </div>

        {estado && (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Ambiente</dt>
              <dd className="font-medium text-ink">{estado.ambiente}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">CUIT</dt>
              <dd className="font-medium text-ink">{estado.cuit_formateado || estado.cuit}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Punto de venta</dt>
              <dd className="font-medium text-ink">{String(estado.punto_venta).padStart(4, "0")}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Token</dt>
              <dd className="font-medium text-ink">
                {estado.token_valido ? "Válido" : "No válido"}
                {estado.token_expira && (
                  <span className="text-ink-muted"> · Expira {formatTokenExpiry(estado.token_expira)}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Certificado</dt>
              <dd className="font-medium text-ink">
                {estado.cert_valido ? "Válido" : "No válido"}
                {estado.cert_dias_restantes != null && (
                  <span className="text-ink-muted"> · Vence en {estado.cert_dias_restantes} días</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Último CAE</dt>
              <dd className="font-medium text-ink">{ultimoCbte ?? estado.ultimo_cae ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-ink-muted">Última comunicación</dt>
              <dd className="font-medium text-ink">{estado.ultima_comunicacion_label}</dd>
            </div>
          </dl>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={test} disabled={testing || !certReady || !keyReady}>
            {testing ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
            Probar conexión
          </Button>
          <Button variant="secondary" onClick={() => void renewToken()} disabled={renewing || !certReady || !keyReady}>
            {renewing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Renovar token
          </Button>
          <Button
            variant="secondary"
            onClick={() => void consultUltimo()}
            disabled={consulting || !certReady || !keyReady}
          >
            {consulting ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Consultar último comprobante
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <ShieldCheck size={18} className="text-brand-600" />
          Facturación electrónica ARCA
        </h3>
        <p className="mb-4 text-sm text-ink-muted">
          Cargá los datos fiscales y el certificado que emitiste en ARCA. La app se conecta
          directamente a los servidores oficiales; el certificado y la clave se guardan cifrados en
          esta PC.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="CUIT"
            inputMode="numeric"
            placeholder="20304050607"
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            hint="11 dígitos, sin guiones."
          />
          <Input
            label="Punto de venta"
            inputMode="numeric"
            placeholder="1"
            value={puntoVenta}
            onChange={(e) => setPuntoVenta(e.target.value)}
            hint="El habilitado en ARCA para web services."
          />
        </div>

        <div className="mt-4">
          <span className="field-label">Ambiente</span>
          <div className="mt-1">
            <SegmentToggle
              value={produccion}
              onChange={setProduccion}
              onLabel="Producción"
              offLabel="Homologación"
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            Usá <strong>Homologación</strong> para pruebas y <strong>Producción</strong> para
            facturar de verdad.
          </p>
        </div>

        <div className="mt-4">
          <span className="field-label">Modo simulación</span>
          <div className="mt-1">
            <SegmentToggle
              value={simulacion}
              onChange={(v) => void toggleSimulacion(v)}
              onLabel="Simulación"
              offLabel="ARCA real"
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            En simulación se ejecuta toda la lógica sin consumir servicios de ARCA. Ideal para
            pruebas de emisión.
          </p>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
          <FileKey size={18} className="text-brand-600" />
          Certificado y clave privada
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileText size={18} className="shrink-0 text-ink-muted" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Certificado (.crt / .pem)</p>
                <p className="truncate text-xs text-ink-muted">
                  {certName
                    ? `Nuevo: ${certName}`
                    : certStored
                      ? "Cargado y guardado."
                      : "No cargado."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {certReady && <BadgeCheck size={18} className="text-green-600" />}
              <Button variant="secondary" onClick={() => pickFile("cert")}>
                <Upload size={16} /> Elegir
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] p-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileKey size={18} className="shrink-0 text-ink-muted" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Clave privada (.key / .pem)</p>
                <p className="truncate text-xs text-ink-muted">
                  {keyName
                    ? `Nueva: ${keyName}`
                    : keyStored
                      ? "Cargada y guardada."
                      : "No cargada."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {keyReady && <BadgeCheck size={18} className="text-green-600" />}
              <Button variant="secondary" onClick={() => pickFile("key")}>
                <Upload size={16} /> Elegir
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      {result && (
        <Alert variant={result.ok ? "success" : "danger"}>
          <div className="space-y-1">
            <p className="font-semibold">{result.mensaje}</p>
            {result.ok && (
              <p className="text-sm">
                Ambiente: {result.ambiente} · Servidores:{" "}
                {result.servidores_ok ? "OK" : "con demoras"} · Token válido hasta{" "}
                {result.ta_expira}
              </p>
            )}
            {result.detalle && <p className="text-sm opacity-90">{result.detalle}</p>}
          </div>
        </Alert>
      )}

      {report && (
        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            <ShieldCheck size={18} className={report.ok ? "text-green-600" : "text-red-600"} />
            Validación de instalación
          </h3>
          <ul className="space-y-1.5">
            {report.pasos.map((paso) => (
              <li key={paso.nombre} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0">
                  {paso.ok === true && <Check size={16} className="text-green-600" />}
                  {paso.ok === false && <X size={16} className="text-red-600" />}
                  {paso.ok === null && <CircleSlash size={16} className="text-ink-muted" />}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-ink">{paso.nombre}</span>
                  {paso.detalle && (
                    <span className="text-ink-muted"> — {paso.detalle}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {!report.ok && report.fallo_en && (
            <p className="mt-3 text-sm font-medium text-red-600">
              Se detuvo en: {report.fallo_en}
            </p>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Guardar configuración
        </Button>
        <Button
          variant="secondary"
          onClick={validate}
          disabled={validating || !certReady || !keyReady}
        >
          {validating ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={16} />}
          Validar instalación
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        Guardá los cambios antes de probar. «Probar conexión» verifica el acceso a ARCA; «Validar
        instalación» revisa certificado, clave y emisión de prueba.
      </p>
    </div>
  );
}

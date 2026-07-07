import { useEffect, useState } from "react";
import {
  BadgeCheck,
  FileKey,
  FileText,
  Loader2,
  PlugZap,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Alert, Button, Card, Input, SegmentToggle } from "../ui";
import {
  arcaGuardarConfig,
  arcaObtenerConfig,
  arcaPickPemFile,
  arcaProbarConexion,
  type ArcaTestResult,
} from "../../lib/arca";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminArcaPanel({ onFlash }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [cuit, setCuit] = useState("");
  const [puntoVenta, setPuntoVenta] = useState("1");
  const [produccion, setProduccion] = useState(false);

  // PEM nuevo seleccionado en esta sesión (null = mantener el ya guardado).
  const [certPem, setCertPem] = useState<string | null>(null);
  const [keyPem, setKeyPem] = useState<string | null>(null);
  const [certName, setCertName] = useState<string | null>(null);
  const [keyName, setKeyName] = useState<string | null>(null);
  const [certStored, setCertStored] = useState(false);
  const [keyStored, setKeyStored] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ArcaTestResult | null>(null);

  useEffect(() => {
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
  }, []);

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
      // Persistido: lo nuevo ya quedó guardado y cifrado.
      if (certPem) setCertStored(true);
      if (keyPem) setKeyStored(true);
      setCertPem(null);
      setKeyPem(null);
      setCertName(null);
      setKeyName(null);
      onFlash("Configuración de ARCA guardada");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setError(null);
    setResult(null);
    setTesting(true);
    try {
      const r = await arcaProbarConexion();
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  }

  const certReady = certPem !== null || certStored;
  const keyReady = keyPem !== null || keyStored;

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

      <div className="flex flex-wrap gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Guardar configuración
        </Button>
        <Button variant="secondary" onClick={test} disabled={testing || !certReady || !keyReady}>
          {testing ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
          Probar conexión
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        “Probar conexión” genera el TRA, lo firma, y solicita Token y Sign a ARCA. Guardá los
        cambios antes de probar.
      </p>
    </div>
  );
}

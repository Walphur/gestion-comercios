import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button, Input } from "../ui";
import {
  CLINIC_BILLING_APP_URL,
  CLINIC_RECORDS_APP_URL,
  saveClinicExternalApps,
} from "../../db/clinicApps";
import { getSetting } from "../../db/settings";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminClinicAppsPanel({ onFlash }: Props) {
  const [billing, setBilling] = useState("");
  const [records, setRecords] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      getSetting(CLINIC_BILLING_APP_URL),
      getSetting(CLINIC_RECORDS_APP_URL),
    ]).then(([billingUrl, recordsUrl]) => {
      setBilling(billingUrl ?? "");
      setRecords(recordsUrl ?? "");
    });
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await saveClinicExternalApps(billing, records);
      onFlash("Enlaces guardados");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los enlaces.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <ExternalLink size={18} className="text-brand-600 dark:text-brand-300" />
        Otras apps del consultorio
      </h3>
      <p className="mb-4 text-sm text-ink-muted">
        WalQo no factura ni emite recetas. Si ya usan otra app, peguen el enlace: desde la agenda
        del profesional se abre el navegador, sin datos del paciente en la dirección.
      </p>
      <div className="space-y-3">
        <Input
          label="App de facturación"
          placeholder="https://"
          value={billing}
          onChange={(e) => setBilling(e.target.value)}
          autoComplete="off"
        />
        <Input
          label="App de historia clínica o recetas (opcional)"
          placeholder="https://"
          value={records}
          onChange={(e) => setRecords(e.target.value)}
          autoComplete="off"
        />
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <Button type="button" loading={saving} onClick={() => save()}>
          Guardar enlaces
        </Button>
      </div>
    </div>
  );
}

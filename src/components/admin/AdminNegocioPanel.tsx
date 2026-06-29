import { Store } from "lucide-react";
import { Input } from "../ui";
import { useAppConfig } from "../../context/AppConfig";
import AdminRubroPanel from "../AdminRubroPanel";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminNegocioPanel({ onFlash }: Props) {
  const cfg = useAppConfig();

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
          <Store size={18} className="text-brand-600" />
          Datos del negocio
        </h3>
        <p className="mb-4 text-sm text-ink-muted">Nombre y moneda que verán tus clientes en tickets y pantallas.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="Nombre del comercio"
            defaultValue={cfg.businessName}
            onBlur={(e) => {
              void cfg.setBusinessName(e.target.value).then(() => onFlash("Guardado"));
            }}
          />
          <Input
            label="Símbolo de moneda"
            defaultValue={cfg.currency}
            onBlur={(e) => {
              void cfg.setCurrency(e.target.value).then(() => onFlash("Guardado"));
            }}
          />
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-ink">Tipo de negocio</h4>
        <p className="mt-1 mb-3 text-xs text-ink-muted">Ajusta menús y textos según tu rubro.</p>
        <AdminRubroPanel onFlash={onFlash} />
      </section>
    </div>
  );
}

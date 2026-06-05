import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { PageHeader, Card } from "../components/ui";

interface Props {
  title: string;
  description: string;
}

export default function ProModulePlaceholder({ title, description }: Props) {
  return (
    <div>
      <PageHeader title={title} subtitle="Módulo Pro — en desarrollo" />
      <Card className="mx-auto max-w-lg p-8 text-center">
        <Sparkles className="mx-auto mb-4 text-brand-500" size={40} />
        <p className="text-sm text-ink-muted">{description}</p>
        <p className="mt-4 text-xs text-ink-muted">
          Ya podés activar este módulo en Administración. Las pantallas completas llegan en próximas
          actualizaciones.
        </p>
        <Link
          to="/admin"
          className="mt-6 inline-flex items-center justify-center rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-input-bg)] px-4 py-2 text-sm font-semibold text-ink hover:border-brand-400"
        >
          Ir a Administración
        </Link>
      </Card>
    </div>
  );
}

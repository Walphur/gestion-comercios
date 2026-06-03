import { Construction } from "lucide-react";
import { PageHeader } from "../components/ui";

export default function ComingSoon({ title, etapa }: { title: string; etapa: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="flex flex-col items-center justify-center p-20 text-center text-ink-muted">
        <Construction size={48} className="mb-4 text-brand-400" />
        <p className="font-display text-lg font-medium text-ink">Módulo en construcción</p>
        <p className="mt-2 max-w-md text-sm">
          Esta sección se desarrolla en la {etapa}. La base ya está lista para sumarla.
        </p>
      </div>
    </div>
  );
}

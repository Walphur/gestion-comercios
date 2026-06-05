import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface LinkItem {
  label: string;
  to: string;
}

export default function WorkshopLinks({ items }: { items: LinkItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-panel-border)] px-3 py-1.5 text-xs font-semibold text-brand-600 hover:border-brand-400 dark:text-brand-300"
        >
          {item.label} <ArrowRight size={12} />
        </Link>
      ))}
    </div>
  );
}

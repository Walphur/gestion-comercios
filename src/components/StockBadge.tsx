import { formatQty, formatUnitShort } from "../lib/format";

interface Props {
  qty: number;
  unit: string;
  low?: boolean;
}

export default function StockBadge({ qty, unit, low = false }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold tabular-nums ${
        low
          ? "bg-red-500/15 text-red-700 dark:text-red-300"
          : "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
      }`}
    >
      <span>{formatQty(qty)}</span>
      <span className="text-[10px] font-normal opacity-75">{formatUnitShort(unit)}</span>
    </span>
  );
}

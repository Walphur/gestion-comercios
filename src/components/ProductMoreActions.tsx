import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Eraser, MoreHorizontal, PackagePlus, Percent, Sparkles, Tags, Upload } from "lucide-react";
import { Button } from "./ui";

interface Props {
  canManage: boolean;
  demoCount: number;
  recoverableCount: number;
  removingDemo: boolean;
  recovering: boolean;
  onCatalog: () => void;
  onExport: () => void;
  onBulkPrice: () => void;
  onRecover: () => void;
  onRemoveDemo: () => void;
  onLoadDemo: () => void;
  onPurchaseEntry: () => void;
}

export default function ProductMoreActions({
  canManage,
  demoCount,
  recoverableCount,
  removingDemo,
  recovering,
  onCatalog,
  onExport,
  onBulkPrice,
  onRecover,
  onRemoveDemo,
  onLoadDemo,
  onPurchaseEntry,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!canManage) {
    return (
      <Button variant="secondary" onClick={onBulkPrice}>
        <Percent size={16} /> Ajuste de precios
      </Button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={16} />
        Más acciones
        <ChevronDown size={14} className={open ? "rotate-180" : ""} />
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 min-w-[14rem] rounded-xl border border-[var(--color-panel-border)] bg-[var(--color-panel)] py-1 shadow-lg">
          <MenuItem icon={Tags} label="Categorías y marcas" onClick={() => { onCatalog(); setOpen(false); }} />
          <MenuItem icon={PackagePlus} label="Ingreso de compra" onClick={() => { onPurchaseEntry(); setOpen(false); }} />
          <MenuItem icon={Download} label="Exportar lista" onClick={() => { onExport(); setOpen(false); }} />
          <MenuItem icon={Percent} label="Ajuste de precios" onClick={() => { onBulkPrice(); setOpen(false); }} />
          {recoverableCount > 0 && (
            <MenuItem
              icon={Upload}
              label={recovering ? "Recuperando…" : `Recuperar importados (${recoverableCount})`}
              onClick={() => { if (!recovering) onRecover(); setOpen(false); }}
            />
          )}
          {demoCount > 0 ? (
            <MenuItem
              icon={Eraser}
              label={removingDemo ? "Quitando ejemplos…" : `Quitar ejemplos (${demoCount})`}
              onClick={() => { if (!removingDemo) onRemoveDemo(); setOpen(false); }}
            />
          ) : (
            <MenuItem
              icon={Sparkles}
              label="Cargar productos de ejemplo"
              onClick={() => { onLoadDemo(); setOpen(false); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Tags;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-brand-50 dark:hover:bg-brand-900/30"
    >
      <Icon size={16} className="text-ink-muted" />
      {label}
    </button>
  );
}

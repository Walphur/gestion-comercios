import AdminPrinterCard from "./AdminPrinterCard";
import AdminLabelsCard from "./AdminLabelsCard";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPrintingPanel({ onFlash }: Props) {
  return (
    <div className="space-y-6">
      <AdminLabelsCard onFlash={onFlash} />
      <AdminPrinterCard onFlash={onFlash} />
    </div>
  );
}

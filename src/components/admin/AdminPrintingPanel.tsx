import AdminPrinterCard from "./AdminPrinterCard";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPrintingPanel({ onFlash }: Props) {
  return <AdminPrinterCard onFlash={onFlash} />;
}

import AdminPrinterCard from "./AdminPrinterCard";
import AdminLabelsCard from "./AdminLabelsCard";
import PlanUpsellNotice from "../PlanUpsellNotice";
import { usePlanEntitlements } from "../../hooks/usePlanEntitlements";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminPrintingPanel({ onFlash }: Props) {
  const { labels } = usePlanEntitlements();
  return (
    <div className="space-y-6">
      {labels ? <AdminLabelsCard onFlash={onFlash} /> : <PlanUpsellNotice feature="labels" />}
      <AdminPrinterCard onFlash={onFlash} />
    </div>
  );
}

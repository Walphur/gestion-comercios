import DemoProductsPanel from "../DemoProductsPanel";
import CatalogSupermarketPanel from "../CatalogSupermarketPanel";

interface Props {
  onFlash: (msg: string) => void;
}

export default function AdminCatalogPanel({ onFlash }: Props) {
  return (
    <div className="space-y-6">
      <DemoProductsPanel onFlash={onFlash} />
      <CatalogSupermarketPanel onFlash={onFlash} />
    </div>
  );
}

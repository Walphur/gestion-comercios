import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Modal } from "./ui";
import { listCategories, createCategory, deleteCategory } from "../db/categories";
import { listBrands, createBrand, deleteBrand } from "../db/brands";
import { listSuppliers, createSupplier, deleteSupplier } from "../db/suppliers";
import { confirmDelete } from "../lib/confirm";
import { formatDbError } from "../lib/dbError";
import type { Brand, Category, Supplier } from "../types";

type Tab = "categories" | "brands" | "suppliers";

interface Props {
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export default function CatalogManager({ open, onClose, onUpdated }: Props) {
  const [tab, setTab] = useState<Tab>("categories");
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  async function reload() {
    const [c, b, s] = await Promise.all([
      listCategories(),
      listBrands(),
      listSuppliers(),
    ]);
    setCategories(c);
    setBrands(b);
    setSuppliers(s);
  }

  useEffect(() => {
    if (open) reload();
  }, [open]);

  async function handleAdd() {
    if (!newName.trim()) return;
    if (tab === "categories") await createCategory(newName);
    else if (tab === "brands") await createBrand(newName);
    else await createSupplier(newName, newPhone);
    setNewName("");
    setNewPhone("");
    await reload();
    onUpdated();
  }

  async function handleDelete(id: number, label: string) {
    if (!(await confirmDelete(label, "Los productos quedarán sin ese dato."))) return;
    try {
      let removed = 0;
      if (tab === "categories") removed = await deleteCategory(id);
      else if (tab === "brands") {
        await deleteBrand(id);
        removed = 1;
      } else {
        await deleteSupplier(id);
        removed = 1;
      }
      if (tab === "categories" && removed === 0) {
        alert("No se pudo eliminar la categoría. Probá de nuevo.");
        return;
      }
      await reload();
      onUpdated();
    } catch (e) {
      alert(formatDbError(e));
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "categories", label: "Categorías" },
    { id: "brands", label: "Marcas" },
    { id: "suppliers", label: "Proveedores" },
  ];

  const items =
    tab === "categories" ? categories : tab === "brands" ? brands : suppliers;

  return (
    <Modal open={open} title="Catálogo: categorías, marcas y proveedores" onClose={onClose} wide>
      <div className="mb-4 flex gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "primary" : "secondary"}
            onClick={() => setTab(t.id)}
            className="text-xs"
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Input
          label={tab === "suppliers" ? "Nombre del proveedor" : "Nombre"}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="min-w-[200px] flex-1"
        />
        {tab === "suppliers" && (
          <Input
            label="Teléfono"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="w-40"
          />
        )}
        <Button onClick={handleAdd}>
          <Plus size={16} /> Agregar
        </Button>
      </div>

      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-brand-100 p-2">
        {items.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-ink-muted">Sin registros.</li>
        )}
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-brand-50/50"
          >
            <span className="text-sm font-medium text-ink">{item.name}</span>
            <button
              type="button"
              onClick={() => void handleDelete(item.id, item.name)}
              className="rounded p-1.5 text-ink-muted hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

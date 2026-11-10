import { useEffect, useState } from "react";
import { NotebookPen, Pencil } from "lucide-react";
import { Button } from "./ui";
import SaleNoteField from "./SaleNoteField";
import { useAuth } from "../context/AuthContext";
import { updateSaleNote } from "../db/sales";
import { logAuditAction } from "../lib/tauri";
import { showUserError } from "../lib/notice";

interface Props {
  saleId: number;
  note: string | null | undefined;
  /** Sin permiso o con la venta anulada solo se muestra. */
  canEdit: boolean;
  onSaved: (note: string | null) => void;
}

/** Detalle de una venta ya registrada, con «Editar detalle». Queda en el historial de acciones. */
export default function SaleNoteEditor({ saleId, note, canEdit, onSaved }: Props) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");

  useEffect(() => {
    setEditing(false);
    setDraft(note ?? "");
  }, [saleId, note]);

  async function save() {
    try {
      const { before, after } = await updateSaleNote(saleId, draft);
      if (user && (before ?? "") !== (after ?? "")) {
        void logAuditAction(
          user.id,
          "sale_note_edited",
          "sale",
          saleId,
          `antes=${before ?? ""} | ahora=${after ?? ""}`,
        );
      }
      setEditing(false);
      onSaved(after);
    } catch (e) {
      showUserError(e);
    }
  }

  if (editing) {
    return (
      <div className="min-w-0 space-y-2">
        <SaleNoteField value={draft} onChange={setDraft} autoOpen autoFocus onEnter={() => void save()} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => save()} data-testid="sale-note-save">
            Guardar detalle
          </Button>
        </div>
      </div>
    );
  }

  const text = note?.trim();
  if (!text && !canEdit) return null;
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm">
      {text ? (
        <p className="flex min-w-0 flex-1 items-start gap-1.5 text-ink" data-testid="sale-note">
          <NotebookPen size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
          <span className="min-w-0 break-words">{text}</span>
        </p>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          onClick={() => {
            setDraft(note ?? "");
            setEditing(true);
          }}
          data-testid="sale-note-edit"
        >
          {text ? <Pencil size={13} /> : null}
          {text ? "Editar detalle" : "+ Agregar detalle"}
        </button>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Gift } from "lucide-react";
import { Button, Modal } from "./ui";
import { useAppConfig } from "../context/AppConfig";
import { loadPendingNotes, markNotesSeen, type PendingNotes } from "../db/whatsNew";
import { CHANGE_KIND_LABEL, type ChangeItem } from "../config/changelog";

const MAX_ITEMS = 6;

export function ChangeList({
  items,
  onGo,
  compact = false,
}: {
  items: ChangeItem[];
  onGo?: (to: string) => void;
  /** Columna angosta: el texto va debajo de la etiqueta. */
  compact?: boolean;
}) {
  return (
    <ul className={`whats-new__list${compact ? " whats-new__list--compact" : ""}`}>
      {items.map((item) => (
        <li key={item.text} className="whats-new__item">
          <span className={`whats-new__kind whats-new__kind--${item.kind}`}>{CHANGE_KIND_LABEL[item.kind]}</span>
          <span className="whats-new__text">{item.text}</span>
          {item.to && onGo && (
            <Button size="sm" variant="ghost" onClick={() => onGo(item.to!)}>
              Ver <ArrowRight size={13} />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Al abrir WalQo después de actualizar, cuenta qué cambió. Una vez por versión. */
export default function WhatsNewModal() {
  const { rubroDef, features } = useAppConfig();
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingNotes | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPendingNotes({ rubroId: rubroDef.id, features })
      .then((p) => alive && setPending(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [rubroDef.id, features]);

  if (!pending) return null;

  const items = pending.notes.flatMap((n) => n.items);
  const shown = items.slice(0, MAX_ITEMS);

  function close() {
    if (pending) void markNotesSeen(pending.version).catch(() => {});
    setPending(null);
  }

  function go(to: string) {
    close();
    navigate(to);
  }

  return (
    <Modal
      open
      title="Novedades de WalQo"
      subtitle={`Ya tenés la versión ${pending.version}. Esto es lo que cambió:`}
      icon={<Gift size={20} />}
      onClose={close}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-sm text-ink-muted hover:text-ink" onClick={() => go("/ayuda?ver=novedades")}>
            {items.length > MAX_ITEMS ? `Ver las ${items.length} novedades` : "Ver todas en Ayuda"}
          </button>
          <Button onClick={close}>Entendido</Button>
        </div>
      }
    >
      <ChangeList items={shown} onGo={go} />
    </Modal>
  );
}

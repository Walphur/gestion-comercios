import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Lightbulb, MessageCircle, Play, X } from "lucide-react";
import { Button } from "./ui";
import GuideVideoModal from "./GuideVideoModal";
import { GUIDE_VIDEOS, helpTopicFor, type GuideVideo, type HelpContext } from "../config/helpTopics";
import { openSupportWhatsApp } from "../lib/supportContact";
import { useAppConfig } from "../context/AppConfig";

/** Tips de la pantalla actual, en un panel lateral que no tapa el trabajo. */
export default function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { businessName, features, isProModuleActive, rubroDef } = useAppConfig();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [playing, setPlaying] = useState<GuideVideo | null>(null);

  useEffect(() => {
    if (!open || playing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, playing, onClose]);

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    if (!open) setPlaying(null);
  }, [open]);

  if (!open) return null;

  const ctx: HelpContext = {
    rubro: rubroDef,
    features,
    appointments: isProModuleActive("appointments"),
    pro: isProModuleActive,
  };
  const topic = helpTopicFor(pathname, search, ctx);
  const Icon = topic.icon;
  const tips = topic.tips(ctx);

  return (
    <>
      <div className="help-panel" role="dialog" aria-modal="false" aria-label={`Ayuda: ${topic.title}`}>
        <button type="button" className="help-panel__scrim" aria-label="Cerrar ayuda" onClick={onClose} />
        <aside className="help-panel__sheet">
          <div className="help-panel__head">
            <span className="help-panel__icon" aria-hidden>
              <Icon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="help-panel__eyebrow">Cómo se usa</p>
              <h2 className="truncate font-display text-lg font-semibold text-ink">{topic.title}</h2>
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 text-ink-muted hover:bg-brand-50 hover:text-ink dark:hover:bg-brand-950/40"
              aria-label="Cerrar ayuda"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>

          <ul className="help-panel__tips">
            {tips.map((tip) => (
              <li key={tip}>
                <Lightbulb size={15} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
                <span>{tip}</span>
              </li>
            ))}
          </ul>

          <div className="help-panel__actions">
            {topic.video && (
              <Button variant="secondary" className="w-full" onClick={() => setPlaying(GUIDE_VIDEOS[topic.video!])}>
                <Play size={15} />
                Ver el video
              </Button>
            )}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                onClose();
                navigate("/ayuda");
              }}
            >
              <BookOpen size={15} />
              Toda la ayuda de WalQo
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => void openSupportWhatsApp(`ayuda con ${topic.title}`, { businessName })}
            >
              <MessageCircle size={15} />
              Preguntanos por WhatsApp
            </Button>
          </div>
        </aside>
      </div>
      <GuideVideoModal video={playing} onClose={() => setPlaying(null)} />
    </>
  );
}

import { useEffect, useState } from "react";
import { ExternalLink, Play, WifiOff } from "lucide-react";
import { Button, Modal } from "./ui";
import type { GuideVideo } from "../config/helpTopics";
import { openExternalUrl } from "../lib/openExternal";

/** Reproduce un video de ayuda dentro de WalQo. Se baja de walqo.pro, así que necesita internet. */
export default function GuideVideoModal({ video, onClose }: { video: GuideVideo | null; onClose: () => void }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [video?.id]);

  return (
    <Modal open={video !== null} title={video?.title ?? ""} onClose={onClose} wide icon={<Play size={18} />}>
      {video && (
        <div className="flex min-w-0 flex-col gap-3">
          {failed ? (
            <div className="guide-video guide-video--failed">
              <WifiOff size={22} aria-hidden />
              <p>No se pudo cargar el video. Revisá que la computadora tenga internet.</p>
            </div>
          ) : (
            <video
              key={video.id}
              className="guide-video"
              src={video.src}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onError={() => setFailed(true)}
            />
          )}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-xs text-ink-muted">Se ve con internet. Podés agrandarlo con el botón del video.</p>
            <Button variant="ghost" size="sm" onClick={() => void openExternalUrl(video.page)}>
              <ExternalLink size={13} />
              Abrir en el navegador
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

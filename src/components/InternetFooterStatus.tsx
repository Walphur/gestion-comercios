import { useEffect, useState } from "react";
import { getConnectionStatus } from "../lib/tauri";

/** «Internet» en verde o rojo, al lado del crédito Waltech. */
export default function InternetFooterStatus() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await getConnectionStatus();
        if (alive) setOnline(s.online);
      } catch {
        if (alive) setOnline(false);
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (online === null) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center"
      title={online ? "Conectado a internet" : "Sin conexión a internet"}
      aria-label={online ? "Conectado a internet" : "Sin conexión a internet"}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          online
            ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.85)]"
            : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.7)]"
        }`}
      />
    </span>
  );
}

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
      className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${
        online ? "text-emerald-400" : "text-red-400"
      }`}
      title={online ? "Conectado a internet" : "Sin conexión a internet"}
    >
      Internet
    </span>
  );
}

import { useEffect, useState } from "react";

interface Props {
  /** compact: solo hora; full: fecha + hora */
  variant?: "compact" | "full";
  className?: string;
}

function formatNow(variant: "compact" | "full"): string {
  const d = new Date();
  if (variant === "compact") {
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Fecha y hora locales, se actualiza cada minuto. */
export default function ClockDisplay({ variant = "full", className = "" }: Props) {
  const [label, setLabel] = useState(() => formatNow(variant));

  useEffect(() => {
    setLabel(formatNow(variant));
    const id = window.setInterval(() => setLabel(formatNow(variant)), 30_000);
    return () => clearInterval(id);
  }, [variant]);

  return (
    <time dateTime={new Date().toISOString()} className={className} title="Fecha y hora local">
      {label}
    </time>
  );
}

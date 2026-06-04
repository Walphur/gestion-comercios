/** Crédito de diseño — tipografía Sora, estilo marca Wal + tech (azul). */
export default function WalTechCredit({
  className = "",
  variant = "sidebar",
}: {
  className?: string;
  variant?: "sidebar" | "light";
}) {
  const isSidebar = variant === "sidebar";
  return (
    <div
      className={`select-none ${className}`}
      title="WalTech — Software para comercios"
    >
      <p
        className={`text-[9px] font-medium uppercase tracking-[0.2em] ${
          isSidebar ? "text-white/35" : "text-ink-muted"
        }`}
      >
        Diseñado por
      </p>
      <p
        className="font-display text-[15px] font-bold leading-none"
        style={{ letterSpacing: "-0.03em" }}
      >
        <span className={isSidebar ? "text-white" : "text-ink"}>Wal</span>
        <span
          className="bg-gradient-to-r from-[#5b9fd4] to-[#3d7ec4] bg-clip-text text-transparent"
          style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          tech
        </span>
      </p>
    </div>
  );
}

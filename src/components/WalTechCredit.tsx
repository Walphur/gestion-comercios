/** Crédito de diseño — tipografía Sora, estilo marca Wal + tech (azul). */
export default function WalTechCredit({
  className = "",
  variant = "sidebar",
}: {
  className?: string;
  variant?: "sidebar" | "light" | "header";
}) {
  const isSidebar = variant === "sidebar";
  const isHeader = variant === "header";
  return (
    <div
      className={`select-none ${className}`}
      title="WalTech — Software para comercios"
    >
      {!isHeader && (
        <p
          className={`font-medium uppercase tracking-[0.2em] ${
            isSidebar ? "text-[10px] text-white/50" : "text-xs text-ink-muted"
          }`}
        >
          Diseñado por
        </p>
      )}
      <p
        className={`font-display font-bold leading-none ${
          isHeader ? "text-sm" : isSidebar ? "text-xl" : "text-[15px]"
        }`}
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

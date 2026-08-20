import { CloudDownload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUpdateAvailability } from "../context/UpdateAvailabilityContext";

/** Banner cuando hay una versión nueva (planes con updates). Clic → Sistema. */
export default function UpdateAvailableBanner() {
  const { latestVersion, currentVersion } = useUpdateAvailability();
  const navigate = useNavigate();

  if (!latestVersion) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/admin?section=system")}
      className="flex w-full items-center justify-center gap-2 border-b border-sky-500/30 bg-sky-500/15 px-3 py-2 text-left text-sm text-ink transition hover:bg-sky-500/25"
    >
      <CloudDownload size={16} className="shrink-0 text-sky-600 dark:text-sky-300" />
      <span>
        Hay una versión nueva (v{latestVersion}
        {currentVersion ? ` · tenés v${currentVersion}` : ""}). Tocá acá para ir a Sistema y
        actualizar.
      </span>
    </button>
  );
}

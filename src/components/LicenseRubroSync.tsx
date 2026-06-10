import { useEffect } from "react";
import { RUBROS } from "../config/rubros";
import { useAppConfig } from "../context/AppConfig";
import { useLicense } from "../context/LicenseContext";

/** Si la licencia es Básica, no dejar un rubro Pro guardado en la base. */
export default function LicenseRubroSync() {
  const { status } = useLicense();
  const { rubro, setRubro, loading } = useAppConfig();

  useEffect(() => {
    if (loading || !status?.active || status.pro_enabled) return;
    if (RUBROS[rubro].planHint !== "pro") return;
    void setRubro("general");
  }, [loading, status?.active, status?.pro_enabled, rubro, setRubro]);

  return null;
}

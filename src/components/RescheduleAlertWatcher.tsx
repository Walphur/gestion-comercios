import { useAppConfig } from "../context/AppConfig";
import { useRescheduleAlerts } from "../hooks/useRescheduleAlerts";

/** Aviso flotante cuando un cliente pide reprogramar por WhatsApp. */
export default function RescheduleAlertWatcher() {
  const { isProModuleActive } = useAppConfig();
  useRescheduleAlerts(isProModuleActive("appointments"), true);
  return null;
}

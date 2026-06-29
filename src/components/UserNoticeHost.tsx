import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Button, Modal } from "./ui";
import { registerNoticeHandler, type UserNoticeOptions } from "../lib/notice";

export default function UserNoticeHost() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<UserNoticeOptions | null>(null);

  useEffect(() => {
    registerNoticeHandler((options) => {
      setOpts(options);
      setOpen(true);
    });
    return () => registerNoticeHandler(null);
  }, []);

  function close() {
    setOpen(false);
    opts?.onConfirm?.();
    setOpts(null);
  }

  const variant = opts?.variant ?? "error";
  const Icon =
    variant === "success" ? CheckCircle2 : variant === "info" ? Info : AlertCircle;
  const iconClass =
    variant === "success"
      ? "text-emerald-600"
      : variant === "info"
        ? "text-brand-600"
        : "text-red-600";

  return (
    <Modal open={open} title={opts?.title ?? "Aviso"} onClose={close}>
      <div className="flex gap-3">
        <Icon size={22} className={`mt-0.5 shrink-0 ${iconClass}`} />
        <p className="text-sm leading-relaxed text-ink">{opts?.message}</p>
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={close}>{opts?.confirmLabel ?? "Entendido"}</Button>
      </div>
    </Modal>
  );
}

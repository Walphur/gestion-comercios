import { useEffect, useState } from "react";
import { Alert, Button, Modal } from "./ui";
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
  const alertVariant =
    variant === "success" ? "success" : variant === "info" ? "info" : "danger";

  return (
    <Modal open={open} title={opts?.title ?? "Aviso"} onClose={close}>
      <Alert variant={alertVariant}>
        <p className="text-sm leading-relaxed">{opts?.message}</p>
      </Alert>
      <div className="mt-6 flex justify-end">
        <Button onClick={close}>{opts?.confirmLabel ?? "Entendido"}</Button>
      </div>
    </Modal>
  );
}

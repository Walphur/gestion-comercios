import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ConfirmDialog, { type ConfirmDialogOptions } from "../components/ConfirmDialog";
import { registerConfirmHandler } from "../lib/confirm";

interface ConfirmContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const [running, setRunning] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const rejectRef = useRef<((reason: unknown) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve, reject) => {
      if (resolveRef.current) {
        resolve(false);
        return;
      }
      resolveRef.current = resolve;
      rejectRef.current = reject;
      setOptions(opts);
      setOpen(true);
    });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setOptions(null);
    setRunning(false);
    resolveRef.current = null;
    rejectRef.current = null;
  }, []);

  const finish = useCallback(
    (value: boolean) => {
      const resolve = resolveRef.current;
      close();
      resolve?.(value);
    },
    [close],
  );

  const handleConfirm = useCallback(async () => {
    const action = options?.action;
    if (!action) {
      finish(true);
      return;
    }
    setRunning(true);
    try {
      await action();
    } catch (e) {
      const reject = rejectRef.current;
      close();
      reject?.(e);
      return;
    }
    finish(true);
  }, [options, finish, close]);

  registerConfirmHandler(confirm);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <ConfirmDialog
          open={open}
          options={options}
          busy={running}
          onConfirm={handleConfirm}
          onCancel={() => finish(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de ConfirmProvider");
  return ctx.confirm;
}

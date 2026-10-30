import { useCallback, useRef, useState } from "react";

/**
 * Candado síncrono para acciones que mueven plata o stock: un Enter o clic doble
 * no las corre dos veces (el estado de React llega tarde para eso).
 * Si la acción terminó bien, el candado sigue puesto un momento más para que un
 * segundo Enter encolado no entre antes de que la pantalla se actualice.
 * La acción devuelve `false` cuando no hizo nada (validación o cancelación) y se libera enseguida.
 */
export function useSubmitLock(holdAfterSuccessMs = 700) {
  const lockedRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<unknown>): Promise<void> => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      setBusy(true);
      let hold = false;
      try {
        hold = (await fn()) !== false;
      } finally {
        const release = () => {
          lockedRef.current = false;
          setBusy(false);
        };
        if (hold && holdAfterSuccessMs > 0) window.setTimeout(release, holdAfterSuccessMs);
        else release();
      }
    },
    [holdAfterSuccessMs],
  );

  return { busy, run };
}

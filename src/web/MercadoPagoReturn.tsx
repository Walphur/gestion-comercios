import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button, Card } from "../components/ui";
import { webCall, webToken } from "./api";

/** Mercado Pago vuelve por docs/oauth/callback.html a /web/?mp_code=…&mp_state=… (o ?mp_error=…). */
export function mercadoPagoReturnParams(): URLSearchParams | null {
  const params = new URLSearchParams(location.search);
  return params.has("mp_state") || params.has("mp_error") ? params : null;
}

function backToApp() {
  location.replace(`${location.pathname}${location.hash}`);
}

export default function MercadoPagoReturn({ params }: { params: URLSearchParams }) {
  const [state, setState] = useState<{ status: "working" | "done" | "error"; message: string }>({
    status: "working",
    message: "Terminando de conectar Mercado Pago…",
  });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const error = params.get("mp_error");
    if (error) {
      setState({ status: "error", message: `Mercado Pago no autorizó la conexión (${error}). Probá de nuevo.` });
      return;
    }
    if (!webToken()) {
      setState({
        status: "error",
        message: "Entrá a WalQo Web en este navegador y volvé a tocar «Conectar con Mercado Pago».",
      });
      return;
    }
    webCall<{ nickname: string }>("/v1/native", {
      cmd: "mp_oauth_finish",
      args: { code: params.get("mp_code") ?? "", state: params.get("mp_state") ?? "" },
    })
      .then((result) => {
        setState({
          status: "done",
          message: `Mercado Pago quedó conectado como ${result.nickname}. Ya podés cobrar con QR.`,
        });
        // Si esta pestaña la abrió WalQo, se cierra sola; la otra ya muestra la cuenta conectada.
        if (window.opener) window.setTimeout(() => window.close(), 2500);
      })
      .catch((e: unknown) => setState({ status: "error", message: e instanceof Error ? e.message : String(e) }));
  }, [params]);

  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--color-surface)] p-4">
      <Card className="w-full max-w-md text-center">
        <div className="mb-3 flex justify-center">
          {state.status === "working" ? (
            <Loader2 className="animate-spin text-brand-600" size={36} />
          ) : state.status === "done" ? (
            <CheckCircle2 className="text-emerald-500" size={36} />
          ) : (
            <XCircle className="text-red-500" size={36} />
          )}
        </div>
        <h1 className="mb-2 text-lg font-semibold text-ink">Mercado Pago</h1>
        <p className="text-sm text-ink-muted">{state.message}</p>
        {state.status !== "working" && (
          <Button className="mt-5 w-full justify-center" onClick={backToApp}>
            Volver a WalQo
          </Button>
        )}
      </Card>
    </div>
  );
}

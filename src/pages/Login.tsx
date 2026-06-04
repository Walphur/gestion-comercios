import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Card } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import WalTechCredit from "../components/WalTechCredit";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("cajero");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  if (user) {
    navigate("/", { replace: true });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(username, pin);
      navigate("/", { replace: true });
    } catch {
      setError("Usuario o PIN incorrecto");
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-surface p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 15% 20%, #99f6e4 0%, transparent 45%), radial-gradient(circle at 85% 80%, #5eead4 0%, transparent 40%)",
        }}
      />
      <Card className="relative w-full max-w-md border-brand-200/60 shadow-xl shadow-brand-900/10">
        <div className="mb-6 text-center">
          <p className="font-display text-2xl font-bold tracking-tight text-brand-800">
            Gestión Comercios
          </p>
          <p className="mt-1 text-sm text-ink-muted">Tu caja, tu negocio — siempre local</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input
            label="PIN"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full py-3">
            Entrar
          </Button>
        </form>
        <p className="mt-6 text-center text-[11px] text-ink-muted/80">
          Demo: cajero/0000 · admin/1234
        </p>
        <div className="mt-6 flex justify-center border-t border-brand-100 pt-4">
          <WalTechCredit variant="light" />
        </div>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Card } from "../components/ui";
import { useAuth } from "../context/AuthContext";

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
    <div className="flex h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-slate-900">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cajero: <code>cajero / 0000</code> — Admin: <code>admin / 1234</code>
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input label="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input
            label="PIN"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full">
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  );
}

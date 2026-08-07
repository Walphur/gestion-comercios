import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, LogIn } from "lucide-react";
import { Button, Input } from "./ui";
import { loginAccount } from "../lib/accountAuth";
import { applyAccountSession } from "../lib/accountSession";
import { useLicense } from "../context/LicenseContext";
import { APP_NAME } from "../config/product";
import walqoMark from "../assets/branding/walqo-logo.png";

interface Props {
  onSuccess: () => void;
  onBack: () => void;
}

export default function AccountLogin({ onSuccess, onBack }: Props) {
  const { refresh } = useLicense();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await loginAccount({ email: email.trim(), password });
      if (!res.ok) {
        setError(res.message || "No se pudo iniciar sesión");
        return;
      }
      await applyAccountSession(
        {
          email: res.email || email.trim().toLowerCase(),
          name: res.name || "",
          business_name: res.business_name,
          rubro: res.rubro,
          license_key: res.license_key,
        },
        refresh,
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="walqo-auth">
      <div className="walqo-auth__card">
        <button type="button" className="walqo-auth__back" onClick={onBack}>
          <ArrowLeft size={18} />
          Volver
        </button>

        <div className="walqo-auth__head">
          <img src={walqoMark} alt="" width={48} height={48} className="walqo-auth__mark" />
          <h1>Iniciar sesión</h1>
          <p>Ingresá con el email y la contraseña de tu cuenta {APP_NAME}.</p>
        </div>

        {error && <p className="walqo-auth__error">{error}</p>}

        <form className="walqo-auth__form" onSubmit={(e) => void handleSubmit(e)}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoFocus
          />
          <div className="relative">
            <Input
              label="Contraseña"
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="La que elegiste al registrarte"
              autoComplete="current-password"
            />
            <button
              type="button"
              className="walqo-auth__eye"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Ocultar" : "Mostrar"}
            >
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <Button type="submit" className="w-full" loading={loading} disabled={loading || !email.includes("@") || password.length < 8}>
            <LogIn size={18} />
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { UserCog } from "lucide-react";
import { Card, Button } from "../ui";

export default function AdminUsersPanel() {
  return (
    <Card>
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-ink">
        <UserCog size={18} className="text-brand-600" />
        Usuarios y permisos
      </h3>
      <p className="mb-4 text-sm text-ink-muted">
        Creá cajeros, encargados y administradores. Cada persona ingresa con su usuario y PIN.
      </p>
      <Link to="/empleados">
        <Button variant="secondary">Gestionar empleados</Button>
      </Link>
    </Card>
  );
}

import { Navigate } from "react-router-dom";

/** Redirige a Configuración → Usuarios (gestión unificada en admin). */
export default function Employees() {
  return <Navigate to="/admin?section=users" replace />;
}

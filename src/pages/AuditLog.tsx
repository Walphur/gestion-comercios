import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { PageHeader, Card } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { listActionLog, type ActionLogRow } from "../db/audit";
import { Navigate } from "react-router-dom";

export default function AuditLog() {
  const { can } = useAuth();
  const [rows, setRows] = useState<ActionLogRow[]>([]);

  useEffect(() => {
    listActionLog().then(setRows).catch(console.error);
  }, []);

  if (!can("view_audit")) {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <PageHeader
        title="Auditoría"
        subtitle="Registro inmutable de acciones críticas. Solo administradores."
      />
      <div className="p-8">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 bg-slate-50">
            <Shield size={18} className="text-brand-600" />
            <span className="text-sm font-medium text-slate-700">Action log</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Usuario</th>
                  <th className="px-4 py-2">Acción</th>
                  <th className="px-4 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{r.created_at}</td>
                    <td className="px-4 py-2">{r.display_name ?? r.user_id ?? "—"}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.action}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {r.entity_type && `${r.entity_type}#${r.entity_id ?? ""} `}
                      {r.details ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

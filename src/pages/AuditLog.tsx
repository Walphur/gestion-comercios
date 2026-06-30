import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { PageHeader, PageContent, DataTableShell, EmptyState } from "../components/ui";
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
      <PageContent>
        <DataTableShell>
          <div className="flex items-center gap-2 border-b border-[var(--color-panel-border)] px-4 py-3">
            <Shield size={18} className="text-brand-600 dark:text-brand-300" />
            <span className="text-sm font-medium text-ink">Registro de acciones</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="cell-empty">
                      <EmptyState
                        compact
                        icon={Shield}
                        title="Sin registros"
                        description="Las acciones críticas de usuarios aparecerán aquí automáticamente."
                      />
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td className="cell-muted whitespace-nowrap">{r.created_at}</td>
                      <td>{r.display_name ?? r.user_id ?? "—"}</td>
                      <td className="font-medium">{r.action}</td>
                      <td className="cell-muted">
                        {r.entity_type && `${r.entity_type}#${r.entity_id ?? ""} `}
                        {r.details ?? ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DataTableShell>
      </PageContent>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { EmptyState, Input, PageContent, PageHeader, Select } from "../components/ui";
import { listCustomers } from "../db/customers";
import type { Customer } from "../types";

function ageLabel(birth: string | null): string {
  if (!birth) return "";
  const born = new Date(`${birth}T12:00:00`);
  if (Number.isNaN(born.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  if (age < 0 || age > 120) return "";
  return `${age} años`;
}

export default function InsuranceDirectory() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState("");

  useEffect(() => {
    void listCustomers("").then(setRows).catch(() => setRows([]));
  }, []);

  const plans = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      const name = row.insurance?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const insurance = row.insurance?.trim() || "";
      if (plan === "sin" && insurance) return false;
      if (plan && plan !== "sin" && insurance !== plan) return false;
      if (!q) return true;
      const blob = [row.name, row.document, row.phone, insurance, row.affiliate_number]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, query, plan]);

  const covered = shown.filter((row) => row.insurance?.trim()).length;

  return (
    <div className="min-h-full min-w-0">
      <PageHeader
        title="Obras sociales"
        subtitle="Planilla de pacientes según la cobertura cargada en su ficha."
      />
      <PageContent className="space-y-4">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <Input
            label="Buscar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, DNI, teléfono o afiliado"
          />
          <Select label="Cobertura" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Todas</option>
            <option value="sin">Sin obra social</option>
            {plans.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={HeartPulse}
            title="Todavía no hay pacientes"
            description="Cargá la ficha en Pacientes. La obra social y el número de afiliado quedan en esa planilla."
            action={
              <Link to="/clientes" className="text-sm font-semibold text-brand-600 hover:underline">
                Ir a pacientes
              </Link>
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={HeartPulse}
            title="Nadie coincide con esa búsqueda"
            description="Probá con otro nombre o elegí otra cobertura."
          />
        ) : (
          <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--color-panel-border)]">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-2 border-b border-[var(--color-panel-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted sm:grid">
              <span>Paciente</span>
              <span>DNI</span>
              <span>Teléfono</span>
              <span>Obra social</span>
              <span>Afiliado</span>
            </div>
            <ul className="divide-y divide-[var(--color-panel-border)]">
              {shown.map((row) => (
                <li key={row.id} className="grid min-w-0 gap-1 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.8fr)] sm:items-center sm:gap-2">
                  <p className="min-w-0 truncate font-medium text-ink">
                    {row.name}
                    {ageLabel(row.birth_date) ? (
                      <span className="ml-2 font-normal text-ink-muted">{ageLabel(row.birth_date)}</span>
                    ) : null}
                  </p>
                  <p className="min-w-0 truncate text-ink-muted">{row.document || "Sin DNI"}</p>
                  <p className="min-w-0 truncate text-ink-muted">{row.phone || "Sin teléfono"}</p>
                  <p className="min-w-0 truncate">{row.insurance?.trim() || "Sin obra social"}</p>
                  <p className="min-w-0 truncate text-ink-muted">{row.affiliate_number?.trim() || "—"}</p>
                </li>
              ))}
            </ul>
            <p className="border-t border-[var(--color-panel-border)] px-3 py-2 text-xs text-ink-muted">
              {shown.length} paciente{shown.length === 1 ? "" : "s"}
              {plan ? "" : ` · ${covered} con obra social`}
              . Para corregir una ficha, abrí Pacientes.
            </p>
          </div>
        )}
      </PageContent>
    </div>
  );
}

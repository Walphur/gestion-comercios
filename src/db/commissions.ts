import { getDb } from "./index";

export interface CommissionRow {
  resource_id: number | null;
  name: string;
  active: boolean;
  commission_service_pct: number;
  commission_product_pct: number;
  sales_count: number;
  services_count: number;
  services_total: number;
  products_total: number;
  commission: number;
}

const SERVICE_UNIT_SQL = `lower(COALESCE(p.unit, '')) IN ('servicio', 'práctica', 'practica', 'sesión', 'sesion')`;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Comisiones por profesional entre dos fechas (YYYY-MM-DD, inclusive).
 * Base: lo cobrado por línea con descuentos; sin recargos, propinas ni ventas anuladas.
 */
export async function listCommissions(from: string, to: string): Promise<CommissionRow[]> {
  const db = await getDb();
  const totals = await db.select<
    {
      resource_id: number | null;
      sales_count: number;
      services_count: number;
      services_total: number;
      products_total: number;
    }[]
  >(
    `SELECT s.resource_id,
            COUNT(DISTINCT s.id) AS sales_count,
            COALESCE(SUM(CASE WHEN ${SERVICE_UNIT_SQL} THEN si.qty ELSE 0 END), 0) AS services_count,
            COALESCE(SUM(CASE WHEN ${SERVICE_UNIT_SQL}
              THEN si.line_total * (1 - MAX(s.discount_pct, 0) / 100.0) ELSE 0 END), 0) AS services_total,
            COALESCE(SUM(CASE WHEN ${SERVICE_UNIT_SQL} THEN 0
              ELSE si.line_total * (1 - MAX(s.discount_pct, 0) / 100.0) END), 0) AS products_total
     FROM sales s
     JOIN sale_items si ON si.sale_id = s.id
     LEFT JOIN products p ON p.id = si.product_id
     WHERE s.voided = 0
       AND si.product_id IS NOT NULL
       AND date(s.created_at) BETWEEN $1 AND $2
     GROUP BY s.resource_id`,
    [from, to],
  );

  const resources = await db.select<
    {
      id: number;
      name: string;
      active: number;
      commission_service_pct: number;
      commission_product_pct: number;
    }[]
  >(
    `SELECT id, name, active, commission_service_pct, commission_product_pct
     FROM workshop_resources ORDER BY sort_order, name`,
  );

  const byResource = new Map(totals.map((t) => [t.resource_id, t]));
  const rows: CommissionRow[] = [];
  for (const r of resources) {
    const t = byResource.get(r.id);
    if (!r.active && !t) continue;
    const servicesTotal = round2(t?.services_total ?? 0);
    const productsTotal = round2(t?.products_total ?? 0);
    rows.push({
      resource_id: r.id,
      name: r.name,
      active: Boolean(r.active),
      commission_service_pct: r.commission_service_pct ?? 0,
      commission_product_pct: r.commission_product_pct ?? 0,
      sales_count: t?.sales_count ?? 0,
      services_count: t?.services_count ?? 0,
      services_total: servicesTotal,
      products_total: productsTotal,
      commission: round2(
        (servicesTotal * (r.commission_service_pct ?? 0)) / 100 +
          (productsTotal * (r.commission_product_pct ?? 0)) / 100,
      ),
    });
  }

  const unassigned = byResource.get(null);
  if (unassigned && unassigned.sales_count > 0) {
    rows.push({
      resource_id: null,
      name: "Sin asignar",
      active: true,
      commission_service_pct: 0,
      commission_product_pct: 0,
      sales_count: unassigned.sales_count,
      services_count: unassigned.services_count,
      services_total: round2(unassigned.services_total),
      products_total: round2(unassigned.products_total),
      commission: 0,
    });
  }
  return rows;
}

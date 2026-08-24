/** Variación porcentual entre períodos (misma convención que reports.ts). */
export function pctChange(current: number, previous: number): number {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current > 0 ? 100 : 0;
}

export function avgTicket(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

export function marginPct(revenue: number, profit: number): number {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

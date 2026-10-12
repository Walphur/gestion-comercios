import { getDb } from "./index";

export async function listServiceResourceIds(productId: number): Promise<number[]> {
  const db = await getDb();
  const rows = await db.select<{ resource_id: number }[]>(
    `SELECT resource_id FROM service_resources WHERE product_id = $1 ORDER BY resource_id`,
    [productId],
  );
  return rows.map((row) => row.resource_id);
}

export async function saveServiceResources(productId: number, resourceIds: number[]): Promise<void> {
  const db = await getDb();
  const unique = [...new Set(resourceIds.filter((id) => Number.isInteger(id) && id > 0))];
  await db.execute("DELETE FROM service_resources WHERE product_id = $1", [productId]);
  for (const resourceId of unique) {
    await db.execute(
      "INSERT OR IGNORE INTO service_resources (product_id, resource_id) VALUES ($1, $2)",
      [productId, resourceId],
    );
  }
}

-- Extract key Fase 2 fields from latest snapshot (no secrets)
SELECT
  updated_at,
  json_extract(payload, '$.sales_today_total') AS sales_today_total,
  json_extract(payload, '$.sales_today_count') AS sales_today_count,
  json_extract(payload, '$.products_total') AS products_total,
  json_extract(payload, '$.stock_summary.products_total') AS ss_products,
  json_extract(payload, '$.stock_summary.critical_count') AS ss_critical,
  json_extract(payload, '$.stock_summary.low_count') AS ss_low,
  json_array_length(json_extract(payload, '$.sales_last_30_days')) AS len_30,
  json_array_length(json_extract(payload, '$.sales_month_to_date')) AS len_mtd,
  json_array_length(json_extract(payload, '$.sales_last_7_days')) AS len_7,
  json_extract(payload, '$.period_compare_7d.current_total') AS cmp7_cur,
  json_extract(payload, '$.period_compare_7d.previous_total') AS cmp7_prev,
  json_extract(payload, '$.period_compare_30d.current_total') AS cmp30_cur,
  json_extract(payload, '$.period_compare_30d.previous_total') AS cmp30_prev,
  json_extract(payload, '$.period_compare_30d.current_count') AS cmp30_count,
  json_array_length(json_extract(payload, '$.low_stock')) AS low_stock_len,
  json_extract(payload, '$.low_stock[0].estimated_days_cover') AS cover0,
  json_extract(payload, '$.business_name') AS business_name,
  json_extract(payload, '$.pushed_at') AS pushed_at
FROM portal_snapshots
ORDER BY updated_at DESC
LIMIT 1;

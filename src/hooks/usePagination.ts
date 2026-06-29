import { useMemo, useState } from "react";
import { TABLE_PAGE_SIZE } from "../design/tokens";

export function usePagination<T>(items: T[], pageSize = TABLE_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  const safePage = Math.min(page, totalPages);

  const slice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  function goTo(next: number) {
    setPage(Math.min(totalPages, Math.max(1, next)));
  }

  function reset() {
    setPage(1);
  }

  return {
    page: safePage,
    totalPages,
    pageSize,
    total: items.length,
    slice,
    goTo,
    reset,
    hasPagination: items.length > pageSize,
  };
}

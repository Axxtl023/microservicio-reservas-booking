export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function buildMeta(total: number, page: number, limit: number): PaginationMeta {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

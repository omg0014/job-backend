/**
 * Every response in this API uses the same envelope:
 *   { success: boolean, data: any, message: string }
 * Status codes still carry meaning — never return 200 for an error.
 */
export const ok = (res, data = null, message = 'OK', statusCode = 200) =>
  res.status(statusCode).json({ success: true, data, message });

export const created = (res, data = null, message = 'Created') =>
  ok(res, data, message, 201);

export const fail = (res, statusCode, message, data = null) =>
  res.status(statusCode).json({ success: false, data, message });

/**
 * Shape returned by every list endpoint.
 */
export const paginated = (items, total, page, limit) => ({
  items,
  total,
  page,
  limit,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});

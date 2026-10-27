import { ApiError } from '../utils/ApiError.js';

/**
 * Validates and replaces `req.body` with the parsed result of a Zod schema.
 * Because this API is POST-only with every parameter in the body, this is the
 * single validation entry point — there are no params or query strings to check.
 */
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});

  if (!result.success) {
    const errors = result.error.errors.map((issue) => ({
      field: issue.path.join('.') || '(body)',
      message: issue.message,
    }));
    return next(ApiError.badRequest('Validation failed', { errors }));
  }

  req.body = result.data;
  return next();
};

/**
 * Operational error with an HTTP status code. Anything thrown that is NOT an
 * ApiError is treated as an unexpected bug by the central error handler and is
 * reported to the client as a generic 500 (no stack traces leak in production).
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Invalid request', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }

  static payloadTooLarge(message = 'File is too large') {
    return new ApiError(413, message);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, message);
  }
}

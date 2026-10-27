import multer from 'multer';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { fail } from '../utils/response.js';

export const notFoundHandler = (req, res) => {
  fail(res, 404, `No endpoint matches POST ${req.originalUrl}`);
};

/**
 * Central error handler. Translates the error types this app can produce into
 * the standard envelope. Unexpected errors become a generic 500 — stack traces
 * never reach the client in production.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let message = 'Something went wrong';
  let data = null;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    data = err.details ?? null;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    data = {
      errors: err.errors.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  } else if (err instanceof multer.MulterError) {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum size is 5 MB.'
        : `Upload failed: ${err.message}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    data = {
      errors: Object.values(err.errors).map((issue) => ({
        field: issue.path,
        message: issue.message,
      })),
    };
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for "${err.path}"`;
  } else if (err?.code === 11000) {
    statusCode = 409;
    message = 'That record already exists';
    data = { keys: Object.keys(err.keyPattern ?? {}) };
  }

  if (statusCode >= 500) {
    console.error('[error]', err);
  } else if (!env.isProd) {
    console.warn(`[error] ${statusCode} ${message}`);
  }

  if (!env.isProd && statusCode >= 500) {
    data = { ...(data ?? {}), stack: err.stack };
  }

  fail(res, statusCode, message, data);
};

import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const message = {
  success: false,
  data: null,
  message: 'Too many requests. Please wait a moment and try again.',
};

/** Tight limit on the auth surface — credential stuffing is the threat here. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/** Uploads are expensive (parse + disk write), so they get their own budget. */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isProd ? 30 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: env.isProd ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

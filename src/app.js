import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { assertPostOnly } from './utils/route.js';
import { registerRoutes } from './routes/index.js';
import { mediaRoutes } from './routes/media.routes.js';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);

  // crossOriginResourcePolicy is relaxed so blob-URL CV previews render in the
  // SPA served from a different origin in development.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (curl, Postman, the requests.http file),
        // which send no Origin header at all.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: false,
      methods: ['POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.isProd ? 'combined' : 'dev'));
  app.use('/api', apiLimiter);

  registerRoutes(app);

  // Mounted outside /api: the only GET in the system, serving recorded video
  // with Range support. See routes/media.routes.js for why.
  app.use('/media', mediaRoutes());

  // Startup assertion: warn loudly if anything drifted back to REST verbs.
  assertPostOnly(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

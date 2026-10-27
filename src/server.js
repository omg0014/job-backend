import { env, probeLlmProvider } from './config/env.js';
import { connectDb } from './config/db.js';
import { seedScreeningTemplate } from './seed/screeningTemplate.js';
import { startMediaWorker } from './services/mediaWorker.js';
import { startRetentionSweep } from './services/retentionService.js';
import { createApp } from './app.js';

const start = async () => {
  try {
    await connectDb();

    // Tells the operator which CV parser is active, and downgrades to regex
    // if Ollama is configured but not actually running.
    await probeLlmProvider();

    // The screening question set lives in the database so it can be edited
    // without a deploy. Idempotent — existing edits are never overwritten.
    const template = await seedScreeningTemplate();
    console.log(
      `[screening] template "${template.name}" — ${template.questions.length} questions, ` +
        `transcode ${env.enableTranscode ? 'on' : 'off'}, storage ${env.storageDriver}`,
    );

    // The worker lives in this process, polling Mongo — no Redis, no second
    // service to deploy.
    startMediaWorker();
    startRetentionSweep();

    const app = createApp();

    const server = app.listen(env.port, () => {
      console.log(`[server] Yugam job portal API listening on http://localhost:${env.port}`);
      console.log(`[server] environment: ${env.nodeEnv}`);
    });

    const shutdown = (signal) => {
      console.log(`\n[server] ${signal} received, shutting down`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[server] failed to start:', err.message);
    process.exit(1);
  }
};

start();

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/.env — resolved relative to this file so the server can be started
// from any working directory.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const list = (value, fallback = []) => {
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
};

export const env = {
  port: int(process.env.PORT, 5050),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/yugam-job-portal',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),

  corsOrigins: list(process.env.CORS_ORIGINS, [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]),

  storageDriver: process.env.STORAGE_DRIVER || 'local',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadBytes: int(process.env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024),

  // ── Module 2: video screening ──────────────────────────────────────
  // Local disk is the V1 default; 'r2' swaps in without touching callers.
  mediaTokenSecret:
    process.env.MEDIA_TOKEN_SECRET || process.env.JWT_SECRET || 'dev-only-insecure-secret',
  signedUrlTtlSeconds: int(process.env.SIGNED_URL_TTL_SECONDS, 900),
  localStoragePath: process.env.LOCAL_STORAGE_PATH || process.env.UPLOAD_DIR || 'uploads',
  storageEndpoint: process.env.STORAGE_ENDPOINT || '',
  storageBucket: process.env.STORAGE_BUCKET || '',
  storageAccessKey: process.env.STORAGE_ACCESS_KEY || '',
  storageSecretKey: process.env.STORAGE_SECRET_KEY || '',
  // ffmpeg is the only part of this system needing real CPU — off until a
  // reviewer actually reports a clip that will not play.
  enableTranscode: bool(process.env.ENABLE_TRANSCODE, false),
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  screeningExpiryDays: int(process.env.SCREENING_EXPIRY_DAYS, 7),
  retentionMonths: int(process.env.RETENTION_MONTHS, 12),
  maxUploadMb: int(process.env.MAX_UPLOAD_MB, 60),

  // Round-two Google Meet. Optional: absent credentials simply mean no
  // auto-generated link.
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',

  llmApiKey: process.env.LLM_API_KEY || '',
  llmApiUrl: process.env.LLM_API_URL || 'https://api.anthropic.com/v1/messages',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  cvParseTimeoutMs: int(process.env.CV_PARSE_TIMEOUT_MS, 30000),

  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: int(process.env.SMTP_PORT, 587),
  smtpSecure: bool(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || 'Yugam International School <no-reply@yugam.edu.in>',

  seedAdmin: {
    name: process.env.SEED_ADMIN_NAME || 'Yugam HR',
    email: process.env.SEED_ADMIN_EMAIL || 'hr@yugam.edu.in',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
  },
};

/**
 * CV parsing provider, resolved once at boot:
 *
 *   ollama     a model running locally — free, no API key, no per-CV cost
 *   anthropic  the hosted API — used when LLM_API_KEY is set
 *   none       neither configured; the regex parser handles every CV
 *
 * Set LLM_PROVIDER to force one. Left unset, an API key selects anthropic and
 * anything else selects ollama, which is then probed at startup — so a stopped
 * Ollama degrades to regex rather than making every upload wait for a timeout.
 */
const resolveProvider = () => {
  const explicit = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;
  return env.llmApiKey ? 'anthropic' : 'ollama';
};

env.llmProvider = resolveProvider();

env.llmModel =
  process.env.LLM_MODEL ||
  (env.llmProvider === 'ollama' ? 'qwen2.5:3b' : 'claude-sonnet-5');

/**
 * Probes Ollama once at boot. Called from server startup rather than at import
 * time so scripts that only need the config are not blocked on a network call.
 */
export const probeLlmProvider = async () => {
  if (env.llmProvider !== 'ollama') {
    console.log(`[cv] parser: ${env.llmProvider === 'none' ? 'regex only' : `${env.llmProvider} (${env.llmModel})`}`);
    return env.llmProvider;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${env.ollamaUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);

    const payload = await response.json();
    const models = (payload.models ?? []).map((m) => m.name);

    if (!models.includes(env.llmModel)) {
      console.warn(
        `[cv] Ollama is running but "${env.llmModel}" is not installed ` +
          `(have: ${models.join(', ') || 'none'}). Run: ollama pull ${env.llmModel}`,
      );
      console.warn('[cv] falling back to the regex parser');
      env.llmProvider = 'none';
      return 'none';
    }

    console.log(`[cv] parser: ollama (${env.llmModel}) — local, free`);
    return 'ollama';
  } catch {
    console.warn(
      `[cv] Ollama not reachable at ${env.ollamaUrl}; using the regex parser. ` +
        'Start it with: brew services start ollama',
    );
    env.llmProvider = 'none';
    return 'none';
  }
};

if (env.isProd && env.jwtSecret === 'dev-only-insecure-secret') {
  throw new Error('JWT_SECRET must be set in production');
}

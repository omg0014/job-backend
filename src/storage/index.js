import { localDriver } from './localDriver.js';
import { r2Driver } from './r2Driver.js';
import { gridfsDriver } from './gridfsDriver.js';
import { env } from '../config/env.js';

/**
 * Nothing outside this module may touch `fs` or an S3 SDK directly. Switching
 * between them is one env var: STORAGE_DRIVER=local|gridfs|r2.
 *
 *   local   the instance's disk — fine on a machine you own
 *   gridfs  inside MongoDB — survives hosts with a throwaway disk (Render)
 *   r2      Cloudflare R2 — videos only; needs the AWS SDK installed
 */
const drivers = { local: localDriver, gridfs: gridfsDriver, r2: r2Driver };

export const storage = drivers[env.storageDriver] ?? localDriver;
export const isLocalStorage = storage.name === 'local';

/**
 * Whether recordings are played through our own signed GET /media/:token
 * route (local and gridfs) rather than a provider's presigned URL (r2).
 */
export const servesOwnMedia = typeof storage.verifyToken === 'function';

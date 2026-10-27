import { localDriver } from './localDriver.js';
import { r2Driver } from './r2Driver.js';
import { env } from '../config/env.js';

/**
 * Nothing outside this module may touch `fs` or an S3 SDK directly. Switching
 * between them is one env var: STORAGE_DRIVER=local|r2.
 */
const drivers = { local: localDriver, r2: r2Driver };

export const storage = drivers[env.storageDriver] ?? localDriver;
export const isLocalStorage = storage.name === 'local';

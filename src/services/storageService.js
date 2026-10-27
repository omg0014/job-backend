import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');

/**
 * Storage is kept behind this small interface so the local-disk driver used in
 * V1 can be swapped for S3/Cloudinary later without touching controllers.
 * Every driver deals in opaque `storagePath` strings.
 */
const localDriver = {
  name: 'local',

  root() {
    return path.resolve(backendRoot, env.uploadDir);
  },

  absolutePath(storagePath) {
    const absolute = path.resolve(this.root(), storagePath);
    // Defence against a crafted storagePath escaping the upload directory.
    if (!absolute.startsWith(this.root() + path.sep)) {
      throw ApiError.badRequest('Invalid file path');
    }
    return absolute;
  },

  async ensureDir(subdir = '') {
    const dir = path.resolve(this.root(), subdir);
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  },

  /** Persists a buffer and returns the storagePath to record on the document. */
  async save(buffer, { originalName, subdir = 'cvs' }) {
    await this.ensureDir(subdir);
    const ext = path.extname(originalName || '').toLowerCase();
    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const storagePath = path.join(subdir, fileName);
    await fsp.writeFile(this.absolutePath(storagePath), buffer);
    return { fileName, storagePath };
  },

  async read(storagePath) {
    try {
      return await fsp.readFile(this.absolutePath(storagePath));
    } catch {
      throw ApiError.notFound('File is no longer available on the server');
    }
  },

  async exists(storagePath) {
    try {
      await fsp.access(this.absolutePath(storagePath), fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  },

  /** Node stream for the two file-download endpoints. */
  createReadStream(storagePath) {
    return fs.createReadStream(this.absolutePath(storagePath));
  },

  async remove(storagePath) {
    try {
      await fsp.unlink(this.absolutePath(storagePath));
    } catch {
      // A missing file is already the desired end state.
    }
  },
};

const drivers = { local: localDriver };

export const storageService = drivers[env.storageDriver] ?? localDriver;

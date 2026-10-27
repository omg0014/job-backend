import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { findFile, openReadStream, readFile, removeFile, writeFile } from '../storage/gridfs.js';

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

/**
 * CVs inside MongoDB GridFS, under the same "cvs/<file>" keys the disk driver
 * uses as paths. Selected by STORAGE_DRIVER=gridfs, alongside the gridfs
 * video driver, so one setting moves every upload off the instance's disk.
 */
const gridfsDriver = {
  name: 'gridfs',

  async save(buffer, { originalName, subdir = 'cvs' }) {
    const ext = path.extname(originalName || '').toLowerCase();
    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    // Forward slashes always: this is a key, not an OS path.
    const storagePath = `${subdir}/${fileName}`;
    await writeFile(storagePath, buffer, { originalName });
    return { fileName, storagePath };
  },

  async read(storagePath) {
    if (!(await findFile(storagePath))) {
      throw ApiError.notFound('File is no longer available on the server');
    }
    return readFile(storagePath);
  },

  async exists(storagePath) {
    return Boolean(await findFile(storagePath));
  },

  createReadStream(storagePath) {
    return openReadStream(storagePath);
  },

  async remove(storagePath) {
    await removeFile(storagePath);
  },
};

const drivers = { local: localDriver, gridfs: gridfsDriver };

export const storageService = drivers[env.storageDriver] ?? localDriver;

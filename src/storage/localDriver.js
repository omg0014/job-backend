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
 * Local-disk implementation of StorageDriver.
 *
 * Chunks are appended to a `.part` file as they arrive and renamed on
 * finalize, so an abandoned upload leaves an obvious partial rather than a
 * file that looks complete.
 */
const root = () => path.resolve(backendRoot, env.localStoragePath);

/** Refuses any key that would escape the storage root. */
const absolute = (key) => {
  const resolved = path.resolve(root(), key);
  if (resolved !== root() && !resolved.startsWith(root() + path.sep)) {
    throw ApiError.badRequest('Invalid storage key');
  }
  return resolved;
};

export const localDriver = {
  name: 'local',

  async appendChunk(key, chunk, index) {
    const target = absolute(`${key}.part`);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    // Index 0 truncates, so a retried answer overwrites cleanly instead of
    // appending onto the abandoned first attempt.
    await fsp.writeFile(target, chunk, { flag: index === 0 ? 'w' : 'a' });
  },

  async finalize(key) {
    const part = absolute(`${key}.part`);
    const final = absolute(key);
    try {
      await fsp.rename(part, final);
    } catch {
      throw ApiError.badRequest('No uploaded chunks found for this answer');
    }
    const { size } = await fsp.stat(final);
    return { key, sizeBytes: size };
  },

  /**
   * Promotes staged chunks to their final key. Recording stages under a
   * neutral key and promotes on completion, so a retake can never leave a
   * half-written file sitting where a finished answer belongs.
   */
  async finalizeAs(stagingKey, finalKey) {
    const part = absolute(`${stagingKey}.part`);
    const final = absolute(finalKey);
    await fsp.mkdir(path.dirname(final), { recursive: true });
    try {
      await fsp.rename(part, final);
    } catch {
      throw ApiError.badRequest('No uploaded chunks found for this answer');
    }
    const { size } = await fsp.stat(final);
    return { key: finalKey, sizeBytes: size };
  },

  async save(key, buffer) {
    const target = absolute(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, buffer);
    return { key, sizeBytes: buffer.length };
  },

  /**
   * Local disk has no presigning, so the URL points at our own media route and
   * carries an HMAC token that encodes the key and an expiry. The GET route
   * needs no session — the token is the authorization.
   */
  async getSignedUrl(key, ttlSeconds = env.signedUrlTtlSeconds) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const payload = `${key}:${expiresAt}`;
    const signature = crypto
      .createHmac('sha256', env.mediaTokenSecret)
      .update(payload)
      .digest('hex');
    const token = Buffer.from(`${payload}:${signature}`).toString('base64url');
    return { url: `/media/${token}`, expiresAt: new Date(expiresAt) };
  },

  /** Inverse of getSignedUrl. Returns null for tampered or expired tokens. */
  verifyToken(token) {
    let decoded;
    try {
      decoded = Buffer.from(String(token), 'base64url').toString('utf8');
    } catch {
      return null;
    }
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon < 0) return null;
    const payload = decoded.slice(0, lastColon);
    const signature = decoded.slice(lastColon + 1);

    const expected = crypto
      .createHmac('sha256', env.mediaTokenSecret)
      .update(payload)
      .digest('hex');

    // Timing-safe compare; lengths must match first or timingSafeEqual throws.
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const sep = payload.lastIndexOf(':');
    const key = payload.slice(0, sep);
    const expiresAt = Number(payload.slice(sep + 1));
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

    return { key, expiresAt };
  },

  async exists(key) {
    // absolute() throws on a traversal attempt — that is a bad request, not a
    // missing file, so it is deliberately raised rather than swallowed below.
    const target = absolute(key);
    try {
      await fsp.access(target, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  },

  async stat(key) {
    return fsp.stat(absolute(key));
  },

  /** Range-aware stream, so the reviewer can drag the timeline. */
  createReadStream(key, options) {
    return fs.createReadStream(absolute(key), options);
  },

  /**
   * Real filesystem path for a key. Local-only, and used solely by the ffmpeg
   * transcode job, which needs a path rather than a stream. The r2 driver will
   * not implement this — it downloads to a temp file instead.
   */
  absolutePathFor(key) {
    return absolute(key);
  },

  /**
   * Deletes staging files older than `cutoff` — recordings a candidate started
   * and abandoned. Nothing references them, so they would otherwise accumulate.
   */
  async listStale(prefix, cutoff) {
    const base = absolute(prefix);
    let removed = 0;
    let entries;
    try {
      entries = await fsp.readdir(base, { withFileTypes: true, recursive: true });
    } catch {
      return 0;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.staging.part')) continue;
      // parentPath is relative to the process CWD, not to `base`, so it is
      // resolved from the storage root rather than joined onto it.
      const parent = entry.parentPath ?? entry.path ?? base;
      const full = path.resolve(parent, entry.name);
      try {
        const { mtime } = await fsp.stat(full);
        if (mtime < cutoff) {
          await fsp.unlink(full);
          removed += 1;
        }
      } catch {
        // Raced with another sweep or already gone.
      }
    }
    return removed;
  },

  async delete(key) {
    for (const candidate of [key, `${key}.part`]) {
      try {
        await fsp.unlink(absolute(candidate));
      } catch {
        // Already gone is the desired end state.
      }
    }
  },
};

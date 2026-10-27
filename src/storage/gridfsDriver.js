import { ApiError } from '../utils/ApiError.js';
import { localDriver } from './localDriver.js';
import {
  ensureStagingIndexes,
  findFile,
  openReadStream,
  removeFile,
  staging,
  writeFile,
} from './gridfs.js';

/**
 * MongoDB GridFS implementation of StorageDriver, for the video screening
 * round. Nothing touches the instance's disk: chunks are staged as documents
 * while the candidate records, and finished answers are GridFS files.
 *
 * Playback uses the same HMAC-signed /media/:token links as the local driver
 * (borrowed below), served by the range-aware GET route so reviewers can
 * scrub the timeline.
 */
export const gridfsDriver = {
  name: 'gridfs',

  /**
   * One document per chunk, keyed by (key, index). Index 0 clears the key
   * first, so a retake starts clean rather than appending onto the abandoned
   * attempt — the same contract as the disk driver's truncating write.
   */
  async appendChunk(key, chunk, index) {
    await ensureStagingIndexes();
    if (index === 0) await staging().deleteMany({ key });
    await staging().updateOne(
      { key, index },
      { $set: { data: chunk, size: chunk.length, createdAt: new Date() } },
      { upsert: true },
    );
  },

  /**
   * Streams the staged chunks, in order, into one GridFS file at `finalKey`,
   * then drops the staging documents. A retake overwrites the earlier answer
   * only once the new one is fully written.
   */
  async finalizeAs(stagingKey, finalKey) {
    const count = await staging().countDocuments({ key: stagingKey });
    if (count === 0) throw ApiError.badRequest('No uploaded chunks found for this answer');

    let sizeBytes = 0;
    const cursor = staging().find({ key: stagingKey }).sort({ index: 1 });
    async function* chunks() {
      for await (const doc of cursor) {
        const part = Buffer.from(doc.data.buffer);
        sizeBytes += part.length;
        yield part;
      }
    }

    await writeFile(finalKey, chunks());
    await staging().deleteMany({ key: stagingKey });
    return { key: finalKey, sizeBytes };
  },

  async finalize(key) {
    return this.finalizeAs(key, key);
  },

  async save(key, buffer) {
    await writeFile(key, buffer);
    return { key, sizeBytes: buffer.length };
  },

  // Signing does not depend on where the bytes live.
  getSignedUrl: localDriver.getSignedUrl,
  verifyToken: localDriver.verifyToken,

  async exists(key) {
    return Boolean(await findFile(key));
  },

  /** The media route reads `size`; the rest mirrors fs.Stats loosely. */
  async stat(key) {
    const file = await findFile(key);
    if (!file) throw ApiError.notFound('Recording not found');
    return { size: file.length, mtime: file.uploadDate };
  },

  /** Range-aware: `{ start, end }` inclusive, like fs.createReadStream. */
  createReadStream(key, options) {
    return openReadStream(key, options);
  },

  /**
   * Staged chunks older than `cutoff` — recordings a candidate started and
   * abandoned. Returns how many recordings were cleared.
   */
  async listStale(prefix, cutoff) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Judged by each recording's newest chunk, so a long answer still being
    // recorded is never swept because its first chunk is old.
    const stale = await staging()
      .aggregate([
        { $match: { key: { $regex: `^${escaped}` } } },
        { $group: { _id: '$key', last: { $max: '$createdAt' } } },
        { $match: { last: { $lt: cutoff } } },
      ])
      .toArray();
    const keys = stale.map((entry) => entry._id);
    if (keys.length === 0) return 0;
    await staging().deleteMany({ key: { $in: keys } });
    return keys.length;
  },

  async delete(key) {
    await removeFile(key);
    await staging().deleteMany({ key });
  },
};

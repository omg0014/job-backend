import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';

/**
 * MongoDB GridFS, shared by the CV store and the video driver.
 *
 * Files live in the `uploads` bucket (collections uploads.files and
 * uploads.chunks) under the same keys the disk driver uses for paths —
 * "cvs/123-abc.pdf", "screening/<applicationId>/q1.webm" — so documents that
 * record a storagePath or storageKey need no change between drivers.
 *
 * This is what makes uploads survive on hosts with a throwaway disk (Render,
 * Railway, Heroku): the bytes are in the database, not on the instance.
 */
const BUCKET = 'uploads';

/** In-progress video chunks, before an answer is finalised into GridFS. */
const STAGING = 'uploads.staging';

const db = () => {
  const database = mongoose.connection.db;
  if (!database) throw new Error('GridFS storage needs an open MongoDB connection');
  return database;
};

export const bucket = () => new mongoose.mongo.GridFSBucket(db(), { bucketName: BUCKET });

export const staging = () => db().collection(STAGING);

let indexesReady = null;
/** Created once per process, on first use. */
export const ensureStagingIndexes = () => {
  indexesReady ??= Promise.all([
    staging().createIndex({ key: 1, index: 1 }, { unique: true }),
    staging().createIndex({ createdAt: 1 }),
  ]).catch((error) => {
    indexesReady = null;
    throw error;
  });
  return indexesReady;
};

/** The newest stored revision of a key, or null. */
export const findFile = async (key) => {
  const [file] = await bucket()
    .find({ filename: key })
    .sort({ uploadDate: -1 })
    .limit(1)
    .toArray();
  return file ?? null;
};

const deleteIds = async (ids) => {
  const gridfs = bucket();
  await Promise.all(ids.map((id) => gridfs.delete(id).catch(() => {})));
};

/** Removes every stored revision of a key. Missing is already the goal. */
export const removeFile = async (key) => {
  const files = await bucket().find({ filename: key }, { projection: { _id: 1 } }).toArray();
  await deleteIds(files.map((file) => file._id));
};

/**
 * Writes a key from a Buffer or an iterable/stream of Buffers. The new file is
 * written in full before older revisions are removed, so there is never a
 * moment when the key has no file — a retake replaces, it does not blank.
 */
export const writeFile = async (key, source, metadata = {}) => {
  const upload = bucket().openUploadStream(key, { metadata });
  const readable = Buffer.isBuffer(source) ? Readable.from([source]) : Readable.from(source);
  await pipeline(readable, upload);

  const older = await bucket()
    .find({ filename: key, _id: { $ne: upload.id } }, { projection: { _id: 1 } })
    .toArray();
  await deleteIds(older.map((file) => file._id));
};

/**
 * Streams a key. `range` is inclusive at both ends, the way HTTP Range is;
 * GridFS takes an exclusive end, so it is converted here.
 */
export const openReadStream = (key, range) =>
  bucket().openDownloadStreamByName(
    key,
    range ? { start: range.start, end: range.end + 1 } : undefined,
  );

/** Whole file into memory — for small files (CVs) only. */
export const readFile = async (key) => {
  const parts = [];
  for await (const part of openReadStream(key)) parts.push(part);
  return Buffer.concat(parts);
};

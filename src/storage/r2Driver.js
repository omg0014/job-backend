import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Cloudflare R2 (S3-compatible) implementation of StorageDriver.
 *
 * The SDK is imported lazily so the dependency is only needed when this driver
 * is actually selected — a local-disk deployment installs nothing extra.
 *
 * To use: npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
 * then set STORAGE_DRIVER=r2 plus the four STORAGE_* variables.
 */
let clientPromise = null;

const sdk = async () => {
  if (!clientPromise) {
    clientPromise = (async () => {
      let S3;
      let presigner;
      try {
        S3 = await import('@aws-sdk/client-s3');
        presigner = await import('@aws-sdk/s3-request-presigner');
      } catch {
        throw new Error(
          'STORAGE_DRIVER=r2 requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner. Run: npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner',
        );
      }
      const client = new S3.S3Client({
        region: 'auto',
        endpoint: env.storageEndpoint,
        credentials: {
          accessKeyId: env.storageAccessKey,
          secretAccessKey: env.storageSecretKey,
        },
      });
      return { S3, presigner, client };
    })();
  }
  return clientPromise;
};

/**
 * Chunks are staged on local disk and uploaded once on finalize.
 *
 * R2 supports multipart uploads, but its 5 MB minimum part size does not fit a
 * 3-second chunk of ~300 KB. Staging locally and uploading one object keeps the
 * recording path identical across both drivers.
 */
const stagingPath = (key) => path.join(os.tmpdir(), 'yugam-screening', `${key.replace(/[/\\]/g, '_')}.part`);

export const r2Driver = {
  name: 'r2',

  async appendChunk(key, chunk, index) {
    const target = stagingPath(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, chunk, { flag: index === 0 ? 'w' : 'a' });
  },

  async finalizeAs(stagingKey, finalKey) {
    const source = stagingPath(stagingKey);
    let body;
    try {
      body = await fsp.readFile(source);
    } catch {
      throw ApiError.badRequest('No uploaded chunks found for this answer');
    }

    const { S3, client } = await sdk();
    await client.send(
      new S3.PutObjectCommand({ Bucket: env.storageBucket, Key: finalKey, Body: body }),
    );
    await fsp.unlink(source).catch(() => {});
    return { key: finalKey, sizeBytes: body.length };
  },

  async finalize(key) {
    return this.finalizeAs(key, key);
  },

  async save(key, buffer) {
    const { S3, client } = await sdk();
    await client.send(
      new S3.PutObjectCommand({ Bucket: env.storageBucket, Key: key, Body: buffer }),
    );
    return { key, sizeBytes: buffer.length };
  },

  /**
   * A real presigned URL. R2 serves it directly with Range support, so the
   * GET /media/:token route is not mounted under this driver at all.
   */
  async getSignedUrl(key, ttlSeconds = env.signedUrlTtlSeconds) {
    const { S3, presigner, client } = await sdk();
    const url = await presigner.getSignedUrl(
      client,
      new S3.GetObjectCommand({ Bucket: env.storageBucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  },

  async exists(key) {
    const { S3, client } = await sdk();
    try {
      await client.send(new S3.HeadObjectCommand({ Bucket: env.storageBucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  },

  async delete(key) {
    const { S3, client } = await sdk();
    await client
      .send(new S3.DeleteObjectCommand({ Bucket: env.storageBucket, Key: key }))
      .catch(() => {});
  },
};

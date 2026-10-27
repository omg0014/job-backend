import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDb } from '../config/db.js';
import { findFile, writeFile } from '../storage/gridfs.js';

/**
 * Copies every file under the local upload folders into GridFS, keyed by its
 * path relative to that folder — exactly the storagePath / storageKey the
 * database already records. Safe to re-run: files already in GridFS are
 * skipped, and nothing on disk is changed or deleted.
 *
 *   MONGO_URI="<atlas uri>" npm run migrate:uploads
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');

const roots = [...new Set([env.uploadDir, env.localStoragePath])].map((dir) =>
  path.resolve(backendRoot, dir),
);

const walk = async (dir) => {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return files.flat();
};

const run = async () => {
  await connectDb();
  let copied = 0;
  let skipped = 0;

  for (const root of roots) {
    for (const file of await walk(root)) {
      const name = path.basename(file);
      // Placeholders and unfinished recordings are not real uploads.
      if (name === '.gitkeep' || name.endsWith('.part') || name === '.DS_Store') continue;

      const key = path.relative(root, file).split(path.sep).join('/');
      if (await findFile(key)) {
        skipped += 1;
        continue;
      }
      await writeFile(key, await fsp.readFile(file), { migratedFrom: 'local' });
      copied += 1;
      console.log(`[migrate] ${key}`);
    }
  }

  console.log(`[migrate] done — ${copied} copied, ${skipped} already in GridFS`);
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('[migrate] failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});

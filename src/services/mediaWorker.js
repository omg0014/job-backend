import { spawn } from 'node:child_process';
import { MediaJob, MAX_ATTEMPTS } from '../models/MediaJob.js';
import { Screening } from '../models/Screening.js';
import { storage } from '../storage/index.js';
import { env } from '../config/env.js';

const POLL_MS = 5000;

/**
 * Claims one job atomically. Two workers racing on the same document is
 * impossible: findOneAndUpdate matches on status, so only one flips it.
 */
const claimJob = async () =>
  MediaJob.findOneAndUpdate(
    { status: 'queued', runAfter: { $lte: new Date() } },
    { $set: { status: 'running' }, $inc: { attempts: 1 } },
    { sort: { runAfter: 1 }, new: true },
  );

const runFfmpeg = (inputPath, outputPath) =>
  new Promise((resolve, reject) => {
    const proc = spawn(env.ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '64k',
      '-movflags', '+faststart',
      outputPath,
    ]);
    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(stderr.slice(-400) || `ffmpeg exited ${code}`)),
    );
  });

/**
 * Normalises one clip to MP4/H.264 + AAC so a recording made on any browser
 * plays on any other. Only runs when ENABLE_TRANSCODE is on.
 */
const handleTranscode = async (job) => {
  const { key, questionOrder } = job.payload;
  if (!(await storage.exists(key))) throw new Error(`Source clip missing: ${key}`);
  if (key.endsWith('.mp4')) {
    await markTranscoded(job.refId, questionOrder, key);
    return;
  }

  const source = storage.absolutePathFor(key);
  const target = source.replace(/\.[^.]+$/, '.mp4');
  await runFfmpeg(source, target);

  const newKey = key.replace(/\.[^.]+$/, '.mp4');
  await markTranscoded(job.refId, questionOrder, newKey);
  // The original is only removed once the document points at the new file, so
  // a crash between the two leaves a playable clip either way.
  await storage.delete(key);
};

const markTranscoded = async (applicationId, questionOrder, key) => {
  await Screening.updateOne(
    { applicationId, 'answers.questionOrder': questionOrder },
    {
      $set: {
        'answers.$.storageKey': key,
        'answers.$.mimeType': 'video/mp4',
        'answers.$.transcodeStatus': 'done',
      },
    },
  );

  // A screening held in 'processing' moves on once every answer is ready.
  const screening = await Screening.findOne({ applicationId });
  if (screening?.status === 'processing') {
    const pending = screening.answers.some((a) => a.transcodeStatus === 'pending');
    if (!pending) {
      screening.status = 'completed';
      await screening.save();
    }
  }
};

/** Deletes recordings past the retention window. */
const handleCleanup = async (job) => {
  const { applicationId } = job.payload;
  const screening = await Screening.findOne({ applicationId });
  if (!screening) return;

  for (const answer of screening.answers) {
    if (answer.storageKey) await storage.delete(answer.storageKey);
    answer.storageKey = '';
  }
  await screening.save();
};

const HANDLERS = { transcode: handleTranscode, cleanup: handleCleanup };

const runJob = async (job) => {
  try {
    const handler = HANDLERS[job.type];
    if (!handler) throw new Error(`Unknown job type ${job.type}`);
    await handler(job);
    job.status = 'done';
    job.lastError = '';
  } catch (error) {
    if (job.attempts >= MAX_ATTEMPTS) {
      job.status = 'failed';
      job.lastError = error.message;
      console.error(`[media] job ${job._id} failed permanently: ${error.message}`);
    } else {
      // Back off 30s, 60s, 90s rather than hammering a broken dependency.
      job.status = 'queued';
      job.lastError = error.message;
      job.runAfter = new Date(Date.now() + job.attempts * 30000);
    }
  }
  await job.save();
};

let timer = null;

/**
 * Runs inside the main API process rather than as a second service. At a
 * school's volume that is correct engineering, not a shortcut — and it halves
 * the hosting bill.
 */
export const startMediaWorker = () => {
  if (timer) return;

  const tick = async () => {
    try {
      let job = await claimJob();
      while (job) {
        await runJob(job);
        job = await claimJob();
      }
    } catch (error) {
      console.error('[media] worker tick failed:', error.message);
    }
  };

  timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  console.log(`[media] worker polling every ${POLL_MS / 1000}s`);
};

export const stopMediaWorker = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

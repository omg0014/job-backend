import { Screening } from '../models/Screening.js';
import { MediaJob } from '../models/MediaJob.js';
import { env } from '../config/env.js';
import { storage } from '../storage/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Queues deletion of recordings past the retention window.
 *
 * Retention is measured from submission, not invitation — the clock starts
 * when the school actually received the data. Work goes through MediaJob
 * rather than deleting inline so a failure is retried and visible.
 */
export const queueExpiredRecordings = async () => {
  const cutoff = new Date(Date.now() - env.retentionMonths * 30 * DAY_MS);

  const stale = await Screening.find({
    submittedAt: { $lt: cutoff },
    'answers.storageKey': { $nin: ['', null] },
  })
    .select('_id applicationId')
    .lean();

  let queued = 0;
  for (const screening of stale) {
    const already = await MediaJob.exists({
      type: 'cleanup',
      refId: screening.applicationId,
      status: { $in: ['queued', 'running'] },
    });
    if (already) continue;

    await MediaJob.create({
      type: 'cleanup',
      refId: screening.applicationId,
      payload: { applicationId: screening.applicationId },
    });
    queued += 1;
  }

  if (queued > 0) {
    console.log(`[retention] queued ${queued} screening(s) for deletion (older than ${env.retentionMonths} months)`);
  }
  return queued;
};

/**
 * Removes staging files from answers that were started and never finished.
 *
 * A candidate who closes the tab mid-recording leaves chunks behind: they are
 * never promoted to a final key, so nothing references them and they would sit
 * on disk indefinitely.
 */
export const sweepAbandonedStaging = async () => {
  if (!storage.listStale) return 0;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const removed = await storage.listStale('screening', cutoff);
  if (removed > 0) console.log(`[retention] removed ${removed} abandoned upload(s)`);
  return removed;
};

let timer = null;

/** Checked once at boot and daily thereafter. */
export const startRetentionSweep = () => {
  if (timer) return;
  const sweep = () => {
    queueExpiredRecordings().catch((error) =>
      console.error('[retention] sweep failed:', error.message),
    );
    sweepAbandonedStaging().catch((error) =>
      console.error('[retention] staging sweep failed:', error.message),
    );
  };
  sweep();
  timer = setInterval(() => {
    queueExpiredRecordings().catch((error) =>
      console.error('[retention] sweep failed:', error.message),
    );
  }, DAY_MS);
  timer.unref?.();
  console.log(`[retention] ${env.retentionMonths}-month sweep active`);
};

export const stopRetentionSweep = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

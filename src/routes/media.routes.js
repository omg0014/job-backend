import { Router } from 'express';
import { storage, servesOwnMedia } from '../storage/index.js';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONLY GET ROUTE IN THIS API. THIS IS DELIBERATE — DO NOT "FIX" IT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Video scrubbing depends on HTTP Range requests. A POST endpoint streaming
 * bytes cannot serve them, so a reviewer would have to download an entire clip
 * before moving the playhead.
 *
 * Authorization still happens over POST: /api/screening/playback-url checks the
 * caller, then returns a URL whose token encodes the storage key and a 15
 * minute expiry, signed with HMAC-SHA256. This route verifies that token and
 * nothing else — no session, no cookie, no database lookup.
 *
 * When STORAGE_DRIVER=r2 this route disappears entirely: R2 serves its own
 * presigned URLs and no frontend code changes.
 */
export const mediaRoutes = () => {
  const router = Router();

  if (!servesOwnMedia) return router;

  router.get('/:token', async (req, res) => {
    const verified = storage.verifyToken(req.params.token);
    if (!verified) {
      // Expired and tampered are the same answer — distinguishing them would
      // tell an attacker which half they got right.
      return res.status(403).json({ success: false, message: 'This link has expired' });
    }

    let stat;
    try {
      stat = await storage.stat(verified.key);
    } catch {
      return res.status(404).json({ success: false, message: 'Recording not found' });
    }

    const total = stat.size;
    const range = req.headers.range;

    const contentType = verified.key.endsWith('.mp4')
      ? 'video/mp4'
      : verified.key.endsWith('.ogg')
        ? 'video/ogg'
        : 'video/webm';

    // Recordings are private; a shared cache must never hold one.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    if (!range) {
      res.setHeader('Content-Length', total);
      return storage
        .createReadStream(verified.key)
        .on('error', () => res.destroy())
        .pipe(res);
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }

    // An open-ended suffix range ("bytes=-500") means the last N bytes.
    let start;
    let end;
    if (match[1] === '') {
      const suffixLength = Number(match[2]);
      if (!suffixLength) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      start = Math.max(0, total - suffixLength);
      end = total - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === '' ? total - 1 : Number(match[2]);
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    end = Math.min(end, total - 1);

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    return storage
      .createReadStream(verified.key, { start, end })
      // A file deleted between stat and read must not leave the request hanging.
      .on('error', () => res.destroy())
      .pipe(res);
  });

  return router;
};

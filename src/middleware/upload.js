import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx']);

/**
 * CVs are buffered in memory so the parser can read them before the storage
 * service decides where the bytes finally live — that keeps the storage layer
 * swappable for S3 later.
 */
export const uploadCv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
    if (ALLOWED_MIME_TYPES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
      return cb(null, true);
    }
    return cb(ApiError.badRequest('Only PDF, DOC and DOCX files are accepted'));
  },
}).single('cv');

/**
 * Video chunks arrive every three seconds while recording, so the per-request
 * limit is small — it bounds one chunk, not a whole answer. The full-answer
 * ceiling is enforced on assembly in finish-answer.
 */
export const uploadChunk = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
}).single('chunk');

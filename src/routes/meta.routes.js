import { Router } from 'express';
import { post } from '../utils/route.js';
import { ok } from '../utils/response.js';
import {
  SUBJECTS,
  SKILLS,
  QUALIFICATIONS,
  DEPARTMENTS,
  LANGUAGES,
  EMPLOYMENT_TYPES,
} from '../utils/taxonomy.js';

/**
 * Seeded vocabulary for the frontend's chip autocompletes. Served from the same
 * source the CV parser matches against, so the two never drift apart.
 */
export const metaRoutes = () => {
  const router = Router();

  post(router, '/taxonomy', (req, res) =>
    ok(
      res,
      {
        subjects: SUBJECTS,
        skills: SKILLS,
        qualifications: QUALIFICATIONS,
        departments: DEPARTMENTS,
        languages: LANGUAGES,
        employmentTypes: EMPLOYMENT_TYPES,
      },
      'Taxonomy',
    ),
  );

  return router;
};

import { env } from '../config/env.js';

/**
 * Round-two conferencing.
 *
 * Google Calendar's API mints a Meet link when an event is created with
 * `conferenceDataVersion=1`. Until OAuth credentials are configured this
 * returns null and the interview keeps whatever link the scheduler typed —
 * scheduling must never fail because conferencing is unconfigured.
 */
export const isMeetConfigured = () =>
  Boolean(env.googleClientId && env.googleClientSecret && env.googleRefreshToken);

const tokenUrl = 'https://oauth2.googleapis.com/token';
const calendarUrl =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1';

const accessToken = async () => {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: env.googleRefreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const body = await response.json();
  return body.access_token;
};

/**
 * Creates a calendar event with a Meet link. Returns null on any failure —
 * the caller treats conferencing as a bonus, never a prerequisite.
 */
export const createMeetLink = async ({ summary, description, startAt, durationMinutes = 45, attendees = [] }) => {
  if (!isMeetConfigured()) return null;

  try {
    const token = await accessToken();
    const start = new Date(startAt);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    const response = await fetch(calendarUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: start.toISOString(), timeZone: 'Asia/Kolkata' },
        end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
        attendees: attendees.filter(Boolean).map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: `yugam-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    });

    if (!response.ok) throw new Error(`Calendar insert failed (${response.status})`);
    const event = await response.json();
    return { hangoutLink: event.hangoutLink ?? null, eventId: event.id ?? null };
  } catch (error) {
    console.error('[meet] link creation failed:', error.message);
    return null;
  }
};

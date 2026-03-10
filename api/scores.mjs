import { insertScore, isLeaderboardConfigured, isLeaderboardReachable, readTopScores } from '../db.mjs';
import { mapRowToScore, validateScorePayload } from '../leaderboard-types.mjs';

function sendJson(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8').send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (!isLeaderboardConfigured()) {
    return sendJson(res, 200, { availability: 'not_configured', scores: [] });
  }

  if (!(await isLeaderboardReachable())) {
    return sendJson(res, 503, { availability: 'unavailable', scores: [] });
  }

  if (req.method === 'GET') {
    try {
      const rows = await readTopScores();
      return sendJson(res, 200, {
        availability: 'ready',
        scores: rows.map(mapRowToScore),
      });
    } catch {
      return sendJson(res, 503, { availability: 'unavailable', scores: [] });
    }
  }

  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const validation = validateScorePayload(payload);

      if (!validation.ok) {
        return sendJson(res, 400, { availability: 'ready', error: validation.error });
      }

      const inserted = await insertScore(validation.value);
      return sendJson(res, 201, { availability: 'ready', score: mapRowToScore(inserted) });
    } catch {
      return sendJson(res, 503, { availability: 'unavailable', error: 'Unable to save score' });
    }
  }

  res.setHeader('allow', 'GET, POST');
  return sendJson(res, 405, { error: 'Method not allowed' });
}

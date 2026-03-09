import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertScore, isLeaderboardConfigured, isLeaderboardReachable, readTopScores } from './db.mjs';
import { mapRowToScore, validateScorePayload } from './leaderboard-types.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': MIME['.json'] });
  res.end(JSON.stringify(body));
}

async function serveStatic(req, res) {
  const pathname = req.url === '/' ? '/index.html' : req.url;
  const cleanPath = pathname.split('?')[0];
  const filePath = path.join(__dirname, cleanPath);

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': MIME[ext] || 'text/plain; charset=utf-8' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

async function handleScoresApi(req, res) {
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
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body || '{}');
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

  return sendJson(res, 405, { error: 'Method not allowed' });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/scores') {
    return handleScoresApi(req, res);
  }

  return serveStatic(req, res);
});

const port = Number(process.env.PORT || 4173);
server.listen(port, '0.0.0.0', () => {
  console.log(`Aim Trainer server running on http://0.0.0.0:${port}`);
});

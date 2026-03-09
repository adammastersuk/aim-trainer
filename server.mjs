import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLeaderboard, writeLeaderboard } from './leaderboard-store.mjs';

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/leaderboard') {
    const game = url.searchParams.get('game') || 'aim-trainer';

    if (req.method === 'GET') {
      const entries = await readLeaderboard(game);
      return sendJson(res, 200, { ok: true, entries });
    }

    if (req.method === 'POST') {
      try {
        let body = '';
        for await (const chunk of req) body += chunk;
        const payload = JSON.parse(body || '{}');
        const result = await writeLeaderboard(game, payload);
        return sendJson(res, 200, { ok: true, ...result });
      } catch {
        return sendJson(res, 400, { ok: false, error: 'Invalid payload' });
      }
    }

    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  return serveStatic(req, res);
});

const port = Number(process.env.PORT || 4173);
server.listen(port, '0.0.0.0', () => {
  console.log(`Aim Trainer server running on http://0.0.0.0:${port}`);
});

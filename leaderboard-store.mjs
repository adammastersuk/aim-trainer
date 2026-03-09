import { promises as fs } from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');
const MAX_ENTRIES = 10;

function normalizeEntry(entry) {
  return {
    runId: String(entry.runId || `run-${Date.now()}`),
    name: String(entry.name || 'Player').slice(0, 20),
    score: Number(entry.score || 0),
    accuracy: Number(entry.accuracy || 0),
    avgReactionMs: Number(entry.avgReactionMs || 0),
    difficulty: String(entry.difficulty || 'classic-30s'),
    createdAt: Number(entry.createdAt || Date.now()),
  };
}

function sortEntries(entries) {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.avgReactionMs !== b.avgReactionMs) return a.avgReactionMs - b.avgReactionMs;
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return a.createdAt - b.createdAt;
    })
    .slice(0, MAX_ENTRIES);
}

export async function readLeaderboard(game) {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return sortEntries(parsed[game] || []);
  } catch {
    return [];
  }
}

export async function writeLeaderboard(game, entry) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let parsed = {};

  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const normalized = normalizeEntry(entry);
  const updated = sortEntries([...(parsed[game] || []), normalized]);
  parsed[game] = updated;

  await fs.writeFile(DATA_FILE, JSON.stringify(parsed, null, 2));

  return {
    entries: updated,
    rank: updated.findIndex((candidate) => candidate.runId === normalized.runId) + 1,
  };
}

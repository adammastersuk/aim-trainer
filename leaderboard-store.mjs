// Obsolete module retained as a stub for backward compatibility.
// Leaderboard persistence now lives in Neon/Postgres via db.mjs and /api/scores.
export async function readLeaderboard() {
  return [];
}

export async function writeLeaderboard() {
  throw new Error('File leaderboard storage has been removed. Use /api/scores instead.');
}

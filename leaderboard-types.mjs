export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 24;
export const DIFFICULTY_MAX_LENGTH = 32;

export function validateScorePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid payload' };
  }

  const name = String(payload.name || '').trim();
  const difficulty = String(payload.difficulty || '').trim();
  const score = Number(payload.score);
  const accuracy = Number(payload.accuracy);
  const avgReactionMs = Number(payload.avg_reaction_ms ?? payload.avgReactionMs);

  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Name must be ${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH} characters` };
  }

  if (!Number.isInteger(score) || score < 0) {
    return { ok: false, error: 'Score must be a non-negative integer' };
  }

  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
    return { ok: false, error: 'Accuracy must be between 0 and 100' };
  }

  if (!Number.isInteger(avgReactionMs) || avgReactionMs < 1 || avgReactionMs > 5000) {
    return { ok: false, error: 'Average reaction time must be an integer between 1 and 5000' };
  }

  if (!difficulty || difficulty.length > DIFFICULTY_MAX_LENGTH || !/^[a-zA-Z0-9_-]+$/.test(difficulty)) {
    return { ok: false, error: 'Difficulty must be a short safe string' };
  }

  return {
    ok: true,
    value: { name, score, accuracy, avgReactionMs, difficulty },
  };
}

export function mapRowToScore(row) {
  return {
    id: row.id,
    name: row.name,
    score: row.score,
    accuracy: Number(row.accuracy),
    avg_reaction_ms: row.avg_reaction_ms,
    difficulty: row.difficulty,
    created_at: row.created_at,
  };
}

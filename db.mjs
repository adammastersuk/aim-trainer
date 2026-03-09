import postgres from 'postgres';

const MAX_LEADERBOARD_ENTRIES = 10;

let client;

function getConnectionString() {
  const raw = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
  if (!raw) return '';
  if (raw.startsWith('psql://')) return `postgres://${raw.slice('psql://'.length)}`;
  if (raw.startsWith('postgresql://')) return `postgres://${raw.slice('postgresql://'.length)}`;
  return raw;
}

function getClient() {
  if (client) return client;
  const connectionString = getConnectionString();
  if (!connectionString) return null;

  client = postgres(connectionString, {
    ssl: 'require',
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60,
  });

  return client;
}

export function isLeaderboardConfigured() {
  return Boolean(getConnectionString());
}

export async function isLeaderboardReachable() {
  const sql = getClient();
  if (!sql) return false;
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function readTopScores() {
  const sql = getClient();
  if (!sql) return [];

  return sql`
    select
      id,
      name,
      score,
      accuracy,
      avg_reaction_ms,
      difficulty,
      created_at
    from aim_trainer_scores
    order by score desc, avg_reaction_ms asc, accuracy desc, created_at asc, id asc
    limit ${MAX_LEADERBOARD_ENTRIES}
  `;
}

export async function insertScore({ name, score, accuracy, avgReactionMs, difficulty }) {
  const sql = getClient();
  if (!sql) throw new Error('Leaderboard DB not configured');

  const rows = await sql`
    insert into aim_trainer_scores (name, score, accuracy, avg_reaction_ms, difficulty)
    values (${name}, ${score}, ${accuracy}, ${avgReactionMs}, ${difficulty})
    returning id, name, score, accuracy, avg_reaction_ms, difficulty, created_at
  `;

  return rows[0];
}

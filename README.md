# Aim Trainer

## Production leaderboard architecture

This project is deployed as a static frontend with a serverless API.

- Frontend app is served from `/aim-trainer`.
- Leaderboard API is implemented as a Vercel Serverless Function at `api/scores.mjs`.
- Requests from `/aim-trainer/api/scores` are rewritten to `/api/scores` via `vercel.json`.
- Neon/Postgres is used for persistent global Top 10 storage.

`server.mjs` is deprecated and only retained for local compatibility. Production should not rely on it.

## Leaderboard API

- `GET /api/scores`
  - `availability: "not_configured"` when neither `POSTGRES_URL` nor `DATABASE_URL` is set.
  - `503` + `availability: "unavailable"` when database cannot be reached.
  - `availability: "ready"` + `scores` when available.
- `POST /api/scores`
  - Same availability guards as GET.
  - Validates payload and inserts a score row.

## Score payload

```json
{
  "name": "Player",
  "score": 1200,
  "accuracy": 92.4,
  "avg_reaction_ms": 341,
  "difficulty": "classic-30s"
}
```

Validation:
- name: 2-24 chars
- score: non-negative integer
- accuracy: 0-100
- avg_reaction_ms: integer 1-5000
- difficulty: `[a-zA-Z0-9_-]`, max 32 chars

## Ranking

Global top 10 order:
1. score DESC
2. avg_reaction_ms ASC
3. accuracy DESC
4. created_at ASC
5. id ASC

## Database setup

Run `db/schema.sql` (or the migration in `db/migrations/2026030901_global_top10.sql`) in Neon/Postgres.

## Env vars

- `POSTGRES_URL` (preferred)
- `DATABASE_URL` (fallback)

The API normalizes `psql://` and `postgresql://` URLs to `postgres://`.

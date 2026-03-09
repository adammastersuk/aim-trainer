create table if not exists aim_trainer_scores (
  id bigserial primary key,
  name varchar(24) not null,
  score integer not null check (score >= 0),
  accuracy numeric(5,2) not null check (accuracy >= 0 and accuracy <= 100),
  avg_reaction_ms integer not null check (avg_reaction_ms >= 1 and avg_reaction_ms <= 5000),
  difficulty varchar(32) not null,
  created_at timestamptz not null default now()
);

create index if not exists aim_trainer_leaderboard_idx
  on aim_trainer_scores (score desc, avg_reaction_ms asc, accuracy desc, created_at asc, id asc);

const RUN_DURATION_MS = 30_000;
const MISS_PENALTY = 35;
const REACTION_TARGET_MS = 450;
const REACTION_FACTOR = 0.08;
const TARGET_MARGIN = 8;
const MAX_ENTRIES = 10;
const MODE = 'classic-30s';
const LEADERBOARD_STORAGE_KEY = 'aim-trainer:leaderboard-cache';
const APP_BASE_PATH = (window.__AIM_TRAINER_ASSET_BASE__ || '/').replace(/\/+$/, '/');
const SCORE_API_PATH = `${APP_BASE_PATH}api/scores`;
const THEME_STORAGE_KEY = 'aim-trainer:theme';

const els = {
  startBtn: document.getElementById('start-btn'),
  restartBtn: document.getElementById('restart-btn'),
  toggleLeaderboardBtn: document.getElementById('toggle-leaderboard-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  timeLeft: document.getElementById('time-left'),
  hits: document.getElementById('hits'),
  misses: document.getElementById('misses'),
  liveScore: document.getElementById('live-score'),
  liveAccuracy: document.getElementById('live-accuracy'),
  streak: document.getElementById('streak'),
  playArea: document.getElementById('play-area'),
  target: document.getElementById('target'),
  playHint: document.getElementById('play-hint'),
  feedback: document.getElementById('feedback'),
  resultCard: document.getElementById('result-card'),
  resultGrid: document.getElementById('result-grid'),
  rankMessage: document.getElementById('rank-message'),
  submitForm: document.getElementById('submit-form'),
  playerName: document.getElementById('player-name'),
  submitBtn: document.getElementById('submit-btn'),
  submitMessage: document.getElementById('submit-message'),
  leaderboardCard: document.getElementById('leaderboard-card'),
  leaderboardTableBody: document.querySelector('#leaderboard-table tbody'),
  leaderboardEmpty: document.getElementById('leaderboard-empty'),
  leaderboardError: document.getElementById('leaderboard-error'),
};

const state = {
  status: 'idle',
  startedAt: 0,
  lastSpawnedAt: 0,
  hits: 0,
  misses: 0,
  streak: 0,
  bestStreak: 0,
  reactionTimes: [],
  timerId: null,
  finalResult: null,
  submittedRunId: null,
};

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

function createGlobalLeaderboard() {
  function readCache() {
    try {
      const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? sortEntries(parsed) : [];
    } catch {
      return [];
    }
  }

  function writeCache(entries) {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(sortEntries(entries)));
  }

  async function list() {
    try {
      const response = await fetch(SCORE_API_PATH, { headers: { Accept: 'application/json' } });
      const payload = await response.json();

      if (payload.availability === 'ready' && Array.isArray(payload.scores)) {
        const rows = sortEntries(
          payload.scores.map((entry) => ({
            ...entry,
            avgReactionMs: entry.avg_reaction_ms,
            createdAt: new Date(entry.created_at).getTime(),
          }))
        );
        writeCache(rows);
        return { ok: true, availability: 'ready', source: 'global', entries: rows };
      }

      if (payload.availability === 'not_configured') {
        return { ok: false, availability: 'not_configured', source: 'cache', entries: readCache() };
      }

      return { ok: false, availability: 'unavailable', source: 'cache', entries: readCache() };
    } catch {
      return { ok: false, availability: 'unavailable', source: 'cache', entries: readCache() };
    }
  }

  async function submit(entry) {
    const response = await fetch(SCORE_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name: entry.name,
        score: entry.score,
        accuracy: entry.accuracy,
        avg_reaction_ms: entry.avgReactionMs,
        difficulty: entry.difficulty,
      }),
    });

    const payload = await response.json();
    if (!response.ok || payload.availability !== 'ready') {
      throw new Error(payload.error || 'Unable to submit score');
    }

    return payload.score;
  }

  return { list, submit };
}

const leaderboard = createGlobalLeaderboard();

function getPreferredTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  els.themeToggleBtn.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
}

function computeAverageReactionMs(samples) {
  if (!samples.length) return 0;
  const total = samples.reduce((sum, value) => sum + value, 0);
  return Math.round(total / samples.length);
}

function computeAccuracy(hits, misses) {
  const attempts = hits + misses;
  return attempts > 0 ? Number(((hits / attempts) * 100).toFixed(1)) : 0;
}

function computeScore({ hits, misses, avgReactionMs }) {
  const reactionAdjustment = Math.max(0, Math.round((avgReactionMs - REACTION_TARGET_MS) * REACTION_FACTOR));
  return Math.max(0, hits * 100 - misses * MISS_PENALTY - reactionAdjustment);
}

function setTargetPosition() {
  const areaRect = els.playArea.getBoundingClientRect();
  const targetRect = els.target.getBoundingClientRect();
  const maxX = Math.max(TARGET_MARGIN, areaRect.width - targetRect.width - TARGET_MARGIN);
  const maxY = Math.max(TARGET_MARGIN, areaRect.height - targetRect.height - TARGET_MARGIN);
  const x = TARGET_MARGIN + Math.random() * (maxX - TARGET_MARGIN);
  const y = TARGET_MARGIN + Math.random() * (maxY - TARGET_MARGIN);

  els.target.style.left = `${x}px`;
  els.target.style.top = `${y}px`;
  state.lastSpawnedAt = performance.now();
}

function setFeedback(text, tone = '') {
  els.feedback.textContent = text;
  els.feedback.className = `feedback ${tone}`.trim();
}

function renderLiveStats(timeRemainingMs) {
  const avgReactionMs = computeAverageReactionMs(state.reactionTimes);
  const score = computeScore({ hits: state.hits, misses: state.misses, avgReactionMs });
  els.timeLeft.textContent = `${Math.max(0, timeRemainingMs / 1000).toFixed(1)}s`;
  els.hits.textContent = String(state.hits);
  els.misses.textContent = String(state.misses);
  els.liveScore.textContent = String(score);
  els.liveAccuracy.textContent = `${computeAccuracy(state.hits, state.misses)}%`;
  els.streak.textContent = String(state.streak);
}

function createFinalResult() {
  const avgReactionMs = computeAverageReactionMs(state.reactionTimes);
  const accuracy = computeAccuracy(state.hits, state.misses);
  const score = computeScore({ hits: state.hits, misses: state.misses, avgReactionMs });
  const createdAt = Date.now();

  return Object.freeze({
    runId: `run-${createdAt}`,
    score,
    hits: state.hits,
    misses: state.misses,
    accuracy,
    avgReactionMs,
    difficulty: MODE,
    createdAt,
    bestStreak: state.bestStreak,
  });
}

function setPlayHint(text = '') {
  els.playHint.textContent = text;
  els.playHint.classList.toggle('hidden', !text);
}

function showResult(result) {
  const items = [
    ['Final Score', result.score],
    ['Hits', result.hits],
    ['Misses', result.misses],
    ['Accuracy', `${result.accuracy}%`],
    ['Avg Reaction', `${result.avgReactionMs}ms`],
    ['Best Streak', result.bestStreak],
  ];

  els.resultGrid.innerHTML = items
    .map(([label, value]) => `<div class="kv-item"><span class="kv-label">${label}</span><span class="kv-value">${value}</span></div>`)
    .join('');

  els.rankMessage.textContent = 'Submit to see your global placement.';
  els.resultCard.classList.remove('hidden');
}

function endRun() {
  if (state.status !== 'running') return;

  clearInterval(state.timerId);
  state.timerId = null;
  state.status = 'finished';
  els.target.style.display = 'none';
  setPlayHint('Run finished. Submit your score or press Reset for another round.');
  setFeedback('Run complete!', 'good');
  state.finalResult = createFinalResult();
  renderLiveStats(0);
  showResult(state.finalResult);
  els.restartBtn.disabled = false;
  els.startBtn.disabled = true;
  els.playerName.focus();
}

function startRun() {
  state.status = 'running';
  state.startedAt = performance.now();
  state.hits = 0;
  state.misses = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.reactionTimes = [];
  state.finalResult = null;
  state.submittedRunId = null;

  els.submitBtn.disabled = false;
  els.submitMessage.textContent = '';
  els.submitForm.reset();
  els.resultCard.classList.add('hidden');
  els.startBtn.disabled = true;
  els.restartBtn.disabled = false;
  els.target.style.display = 'block';
  setPlayHint('');
  setFeedback('Go!', 'good');

  setTargetPosition();
  renderLiveStats(RUN_DURATION_MS);

  state.timerId = setInterval(() => {
    const elapsed = performance.now() - state.startedAt;
    const remaining = RUN_DURATION_MS - elapsed;
    if (remaining <= 0) {
      endRun();
      return;
    }
    renderLiveStats(remaining);
  }, 50);
}

function restartRun() {
  clearInterval(state.timerId);
  state.status = 'idle';
  state.timerId = null;
  state.finalResult = null;
  state.submittedRunId = null;

  els.startBtn.disabled = false;
  els.restartBtn.disabled = true;
  els.submitBtn.disabled = false;
  els.submitForm.reset();
  els.submitMessage.textContent = '';
  els.resultCard.classList.add('hidden');
  setPlayHint('Tap/click the arena (or press Start) to begin.');
  setFeedback('');
  els.target.style.display = 'none';
  renderLiveStats(RUN_DURATION_MS);
}

function handlePlayAreaPress(event) {
  if (state.status !== 'running') {
    startRun();
    return;
  }

  if (event.target === els.target) {
    state.hits += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    const reaction = Math.round(performance.now() - state.lastSpawnedAt);
    state.reactionTimes.push(reaction);
    els.target.classList.add('hit');
    setTimeout(() => els.target.classList.remove('hit'), 90);
    setFeedback(`${reaction}ms hit${state.streak >= 3 ? ` • ${state.streak} streak` : ''}`, 'good');
    setTargetPosition();
    renderLiveStats(RUN_DURATION_MS - (performance.now() - state.startedAt));
    return;
  }

  state.misses += 1;
  state.streak = 0;
  els.playArea.classList.add('miss');
  setTimeout(() => els.playArea.classList.remove('miss'), 110);
  setFeedback('Miss', 'bad');
  renderLiveStats(RUN_DURATION_MS - (performance.now() - state.startedAt));
}

function formatWhen(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

async function renderLeaderboard() {
  const response = await leaderboard.list();
  const rows = response.entries;
  els.leaderboardTableBody.innerHTML = '';
  const showError = response.availability === 'unavailable';
  els.leaderboardError.classList.toggle('hidden', !showError);

  if (response.availability === 'not_configured') {
    els.leaderboardEmpty.classList.remove('hidden');
    els.leaderboardEmpty.textContent = 'Global leaderboard is not configured yet.';
    return;
  }

  if (!rows.length) {
    els.leaderboardEmpty.textContent = 'No scores yet. Be the first to submit!';
    els.leaderboardEmpty.classList.remove('hidden');
    return;
  }

  els.leaderboardEmpty.classList.add('hidden');
  els.leaderboardEmpty.textContent = 'No global scores yet. Finish a run and submit to claim the first spot.';
  rows.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${entry.name}</td>
      <td>${entry.score}</td>
      <td>${entry.accuracy}%</td>
      <td>${entry.avgReactionMs}ms</td>
      <td>${entry.difficulty || MODE}</td>
      <td>${formatWhen(entry.createdAt)}</td>
    `;
    els.leaderboardTableBody.append(tr);
  });
}

async function toggleLeaderboardVisibility() {
  els.leaderboardCard.classList.toggle('show');
  const isShown = els.leaderboardCard.classList.contains('show');
  els.toggleLeaderboardBtn.textContent = isShown ? 'Hide Leaderboard' : 'Leaderboard';
  if (isShown) await renderLeaderboard();
}

els.startBtn.addEventListener('click', () => {
  if (state.status === 'running') return;
  startRun();
});

els.restartBtn.addEventListener('click', restartRun);
els.playArea.addEventListener('pointerdown', handlePlayAreaPress);
els.playArea.addEventListener('keydown', (event) => {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    handlePlayAreaPress(event);
  }
});

window.addEventListener('resize', () => {
  if (state.status === 'running') setTargetPosition();
});

els.toggleLeaderboardBtn.addEventListener('click', () => {
  toggleLeaderboardVisibility();
});
els.themeToggleBtn.addEventListener('click', toggleTheme);

els.submitForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (state.status !== 'finished' || !state.finalResult) {
    els.submitMessage.textContent = 'Finish a run before submitting.';
    return;
  }

  if (state.submittedRunId === state.finalResult.runId) {
    els.submitMessage.textContent = 'This run was already submitted.';
    return;
  }

  const name = els.playerName.value.trim();
  if (!name) {
    els.submitMessage.textContent = 'Enter a name to submit.';
    return;
  }

  els.submitBtn.disabled = true;
  els.submitMessage.textContent = 'Submitting...';

  try {
    const availability = await leaderboard.list();
    if (availability.availability !== 'ready') {
      els.submitMessage.textContent = 'Global leaderboard is unavailable right now. Submission is disabled.';
      return;
    }

    const payload = {
      runId: state.finalResult.runId,
      name,
      score: state.finalResult.score,
      accuracy: state.finalResult.accuracy,
      avgReactionMs: state.finalResult.avgReactionMs,
      difficulty: state.finalResult.difficulty,
      createdAt: state.finalResult.createdAt,
    };

    await leaderboard.submit(payload);
    state.submittedRunId = state.finalResult.runId;
    els.submitMessage.textContent = 'Score submitted successfully.';
    await renderLeaderboard();

    const refreshed = await leaderboard.list();
    const rank = refreshed.entries.findIndex((entry) => entry.runId === state.finalResult.runId || (entry.name === payload.name && entry.score === payload.score && entry.avgReactionMs === payload.avgReactionMs)) + 1;
    els.rankMessage.textContent = rank > 0 ? `Placed #${rank} on the global leaderboard.` : 'Submitted to global leaderboard.';
  } catch (error) {
    els.submitMessage.textContent = error.message || 'Unable to submit right now. Please try again.';
  } finally {
    els.submitBtn.disabled = false;
  }
});

els.playerName.addEventListener('keydown', (event) => {
  event.stopPropagation();
});

applyTheme(getPreferredTheme());
renderLiveStats(RUN_DURATION_MS);
renderLeaderboard();
setPlayHint('Tap/click the arena (or press Start) to begin.');

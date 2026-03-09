const RUN_DURATION_MS = 30_000;
const MISS_PENALTY = 35;
const REACTION_TARGET_MS = 450;
const REACTION_FACTOR = 0.08;
const TARGET_MARGIN = 8;
const MAX_ENTRIES = 25;
const LEADERBOARD_STORAGE_KEY = 'aim-trainer:leaderboard';
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
  playArea: document.getElementById('play-area'),
  target: document.getElementById('target'),
  playHint: document.getElementById('play-hint'),
  resultCard: document.getElementById('result-card'),
  resultGrid: document.getElementById('result-grid'),
  submitForm: document.getElementById('submit-form'),
  playerName: document.getElementById('player-name'),
  submitBtn: document.getElementById('submit-btn'),
  submitMessage: document.getElementById('submit-message'),
  leaderboardCard: document.getElementById('leaderboard-card'),
  leaderboardTableBody: document.querySelector('#leaderboard-table tbody'),
  leaderboardEmpty: document.getElementById('leaderboard-empty'),
};

const state = {
  status: 'idle',
  startedAt: 0,
  lastSpawnedAt: 0,
  hits: 0,
  misses: 0,
  reactionTimes: [],
  timerId: null,
  finalResult: null,
  submittedRunId: null,
};

function createLocalLeaderboard() {
  function read() {
    try {
      const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(entries) {
    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(entries));
  }

  function sortEntries(entries) {
    return [...entries]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.createdAt - b.createdAt;
      })
      .slice(0, MAX_ENTRIES);
  }

  function list() {
    return sortEntries(read());
  }

  async function submit(entry) {
    const entries = sortEntries([...read(), entry]);
    write(entries);

    const rank = entries.findIndex(
      (candidate) =>
        candidate.createdAt === entry.createdAt &&
        candidate.name === entry.name &&
        candidate.score === entry.score,
    );

    return {
      ok: true,
      rank: rank + 1,
      entry,
    };
  }

  return {
    list,
    submit,
  };
}

const leaderboard = createLocalLeaderboard();

function getPreferredTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  els.themeToggleBtn.textContent = theme === 'dark' ? 'Use Light Mode' : 'Use Dark Mode';
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

function renderLiveStats(timeRemainingMs) {
  const avgReactionMs = computeAverageReactionMs(state.reactionTimes);
  const score = computeScore({ hits: state.hits, misses: state.misses, avgReactionMs });
  els.timeLeft.textContent = `${Math.max(0, timeRemainingMs / 1000).toFixed(1)}s`;
  els.hits.textContent = String(state.hits);
  els.misses.textContent = String(state.misses);
  els.liveScore.textContent = String(score);
}

function createFinalResult() {
  const avgReactionMs = computeAverageReactionMs(state.reactionTimes);
  const attempts = state.hits + state.misses;
  const accuracy = attempts > 0 ? Number(((state.hits / attempts) * 100).toFixed(1)) : 0;
  const score = computeScore({ hits: state.hits, misses: state.misses, avgReactionMs });
  const createdAt = Date.now();

  return Object.freeze({
    runId: `run-${createdAt}`,
    hits: state.hits,
    misses: state.misses,
    accuracy,
    avgReactionMs,
    score,
    createdAt,
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
  ];

  els.resultGrid.innerHTML = items
    .map(
      ([label, value]) =>
        `<div class="kv-item"><span class="kv-label">${label}</span><span class="kv-value">${value}</span></div>`,
    )
    .join('');

  els.resultCard.classList.remove('hidden');
}

function endRun() {
  if (state.status !== 'running') return;

  clearInterval(state.timerId);
  state.timerId = null;
  state.status = 'finished';
  els.target.style.display = 'none';
  setPlayHint('Run finished. Submit your score or restart. Tap the play area to start a new run.');
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
  setPlayHint();

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
  setPlayHint('Tap/click anywhere in the play area (or press Start) to begin.');
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
    const reaction = Math.round(performance.now() - state.lastSpawnedAt);
    state.reactionTimes.push(reaction);
    els.target.classList.add('hit');
    setTimeout(() => els.target.classList.remove('hit'), 80);
    setTargetPosition();
    renderLiveStats(RUN_DURATION_MS - (performance.now() - state.startedAt));
    return;
  }

  state.misses += 1;
  renderLiveStats(RUN_DURATION_MS - (performance.now() - state.startedAt));
}

function renderLeaderboard() {
  const rows = leaderboard.list();
  els.leaderboardTableBody.innerHTML = '';

  if (!rows.length) {
    els.leaderboardEmpty.classList.remove('hidden');
    return;
  }

  els.leaderboardEmpty.classList.add('hidden');

  rows.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${entry.name}</td>
      <td>${entry.score}</td>
      <td>${entry.hits}</td>
      <td>${entry.misses}</td>
      <td>${entry.accuracy}%</td>
      <td>${entry.avgReactionMs}ms</td>
    `;
    els.leaderboardTableBody.append(tr);
  });
}

function toggleLeaderboardVisibility() {
  els.leaderboardCard.classList.toggle('show');
  const isShown = els.leaderboardCard.classList.contains('show');
  els.toggleLeaderboardBtn.textContent = isShown ? 'Hide Leaderboard' : 'View Leaderboard';
  renderLeaderboard();
}

els.startBtn.addEventListener('click', () => {
  if (state.status === 'running') return;
  startRun();
});

els.restartBtn.addEventListener('click', restartRun);
els.playArea.addEventListener('pointerdown', handlePlayAreaPress);

window.addEventListener('resize', () => {
  if (state.status === 'running') {
    setTargetPosition();
  }
});

els.toggleLeaderboardBtn.addEventListener('click', toggleLeaderboardVisibility);
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
    const payload = {
      name,
      score: state.finalResult.score,
      hits: state.finalResult.hits,
      misses: state.finalResult.misses,
      accuracy: state.finalResult.accuracy,
      avgReactionMs: state.finalResult.avgReactionMs,
      createdAt: state.finalResult.createdAt,
    };

    const response = await leaderboard.submit(payload);
    if (!response.ok) {
      throw new Error('Submit failed');
    }

    state.submittedRunId = state.finalResult.runId;
    els.submitMessage.textContent = `Submitted! Rank #${response.rank}. Score ${state.finalResult.score}.`;
    renderLeaderboard();
  } catch {
    els.submitMessage.textContent = 'Unable to submit right now. Please try again.';
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
setPlayHint('Tap/click anywhere in the play area (or press Start) to begin.');

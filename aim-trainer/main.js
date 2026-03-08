import { createLocalLeaderboard } from '/shared/js/leaderboard.js';

const RUN_DURATION_MS = 30_000;
const MISS_PENALTY = 35;
const REACTION_TARGET_MS = 450;
const REACTION_FACTOR = 0.08;
const TARGET_MARGIN = 6;

const leaderboard = createLocalLeaderboard('aim-trainer');

const els = {
  startBtn: document.getElementById('start-btn'),
  restartBtn: document.getElementById('restart-btn'),
  toggleLeaderboardBtn: document.getElementById('toggle-leaderboard-btn'),
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

function lockFinalResult() {
  const avgReactionMs = computeAverageReactionMs(state.reactionTimes);
  const accuracy = state.hits + state.misses > 0 ? Number(((state.hits / (state.hits + state.misses)) * 100).toFixed(1)) : 0;
  const score = computeScore({ hits: state.hits, misses: state.misses, avgReactionMs });

  return Object.freeze({
    runId: `run-${Date.now()}`,
    hits: state.hits,
    misses: state.misses,
    accuracy,
    avgReactionMs,
    score,
    createdAt: Date.now(),
  });
}

function showResult(result) {
  const items = [
    ['Score', result.score],
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
  els.playHint.textContent = 'Run finished. Submit your score or restart.';
  state.finalResult = lockFinalResult();
  renderLiveStats(0);
  showResult(state.finalResult);
  els.restartBtn.disabled = false;
  els.startBtn.disabled = true;
}

function startRun() {
  state.status = 'running';
  state.startedAt = performance.now();
  state.hits = 0;
  state.misses = 0;
  state.reactionTimes = [];
  state.finalResult = null;
  state.submittedRunId = null;

  els.submitMessage.textContent = '';
  els.resultCard.classList.add('hidden');
  els.startBtn.disabled = true;
  els.restartBtn.disabled = false;
  els.target.style.display = 'block';
  els.playHint.textContent = '';
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
  els.startBtn.disabled = false;
  els.restartBtn.disabled = true;
  els.resultCard.classList.add('hidden');
  els.playHint.textContent = 'Press start to begin.';
  els.target.style.display = 'none';
  renderLiveStats(RUN_DURATION_MS);
}

els.startBtn.addEventListener('click', () => {
  if (state.status === 'running') return;
  startRun();
});

els.restartBtn.addEventListener('click', () => {
  restartRun();
});

els.playArea.addEventListener('click', (event) => {
  if (state.status !== 'running') return;

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
});

window.addEventListener('resize', () => {
  if (state.status === 'running') {
    setTargetPosition();
  }
});

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
      <td>${entry.accuracy}%</td>
    `;
    els.leaderboardTableBody.append(tr);
  });
}

els.toggleLeaderboardBtn.addEventListener('click', () => {
  els.leaderboardCard.classList.toggle('show');
  renderLeaderboard();
});

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

restartRun();
renderLeaderboard();

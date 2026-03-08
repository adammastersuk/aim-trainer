const MAX_ENTRIES = 25;

export function createLocalLeaderboard(gameKey) {
  const storageKey = `builds:leaderboard:${gameKey}`;

  function read() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function write(entries) {
    localStorage.setItem(storageKey, JSON.stringify(entries));
  }

  function list() {
    return read()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.createdAt - b.createdAt;
      })
      .slice(0, MAX_ENTRIES);
  }

  async function submit(entry) {
    const entries = list();
    entries.push(entry);
    const sorted = entries
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.createdAt - b.createdAt;
      })
      .slice(0, MAX_ENTRIES);

    write(sorted);

    const rank = sorted.findIndex(
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

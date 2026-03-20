const STORAGE_KEY = 'cdo_gas_vote_cooldown_until';
const COOLDOWN_MS = 5 * 60 * 1000;

export function getVoteCooldownRemainingMs() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const until = parseInt(raw, 10);
    if (Number.isNaN(until)) return 0;
    return Math.max(0, until - Date.now());
  } catch {
    return 0;
  }
}

/** Call after any successful vote API action (like, dislike, or remove). */
export function startVoteCooldown() {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(Date.now() + COOLDOWN_MS));
  } catch {
    /* ignore */
  }
}

/** mm:ss for UI */
export function formatCooldownClock(ms) {
  const sec = Math.ceil(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

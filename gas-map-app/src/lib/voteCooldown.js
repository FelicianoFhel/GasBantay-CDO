import { FUEL_TYPES } from '../constants';

const COOLDOWN_MS = 5 * 60 * 1000;
const PREFIX = 'cdo_gas_vote_cooldown_until_';

const ALLOWED = new Set(FUEL_TYPES.map((f) => f.value));

function normalizeFuel(fuelType) {
  return fuelType && ALLOWED.has(fuelType) ? fuelType : null;
}

function keyFor(fuelType) {
  const f = normalizeFuel(fuelType);
  return f ? PREFIX + f : null;
}

export function getVoteCooldownRemainingMs(fuelType) {
  const key = keyFor(fuelType);
  if (!key) return 0;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return 0;
    const until = parseInt(raw, 10);
    if (Number.isNaN(until)) return 0;
    return Math.max(0, until - Date.now());
  } catch {
    return 0;
  }
}

/** After a successful vote on a report of this fuel type. */
export function startVoteCooldown(fuelType) {
  const key = keyFor(fuelType);
  if (!key) return;
  try {
    sessionStorage.setItem(key, String(Date.now() + COOLDOWN_MS));
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

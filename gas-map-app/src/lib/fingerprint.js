const STORAGE_KEY = 'cdo_gas_fingerprint';
const SESSION_VOTER_KEY = 'cdo_gas_voter_id';

/** Long-lived ID (localStorage) – kept for any legacy use. */
export function getFingerprint() {
  let fp = localStorage.getItem(STORAGE_KEY);
  if (!fp) {
    fp = 'anon_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(STORAGE_KEY, fp);
  }
  return fp;
}

/**
 * Session-based voter ID: one vote per report per browser session, no login.
 * Resets when the tab is closed. Prevents spam; same user in new session can vote again.
 */
export function getVoterId() {
  try {
    let id = sessionStorage.getItem(SESSION_VOTER_KEY);
    if (!id) {
      id = 'sess_' + Math.random().toString(36).slice(2, 12) + '_' + Date.now().toString(36);
      sessionStorage.setItem(SESSION_VOTER_KEY, id);
    }
    return id;
  } catch (_) {
    return getFingerprint();
  }
}

import crypto from 'crypto';

const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function fromB64url(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return secret && secret.length >= 24 ? secret : '';
}

export function isAdminEnvConfigured() {
  return Boolean(
    process.env.ADMIN_USERNAME &&
      process.env.ADMIN_PASSWORD &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      getSecret()
  );
}

export function validateAdminCredentials(username, password) {
  const u = String(username || '');
  const p = String(password || '');
  return u === String(process.env.ADMIN_USERNAME || '') && p === String(process.env.ADMIN_PASSWORD || '');
}

export function createAdminToken(username) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: String(username || 'admin'),
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    })
  );
  const secret = getSecret();
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyAdminToken(authHeader) {
  const raw = String(authHeader || '');
  if (!raw.startsWith('Bearer ')) return { ok: false };
  const token = raw.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false };
  const [header, payload, sig] = parts;
  const secret = getSecret();
  if (!secret) return { ok: false };
  const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  if (expected !== sig) return { ok: false };
  try {
    const decoded = JSON.parse(fromB64url(payload));
    if (!decoded?.exp || decoded.exp < Math.floor(Date.now() / 1000)) return { ok: false };
    return { ok: true, username: decoded.sub || 'admin' };
  } catch {
    return { ok: false };
  }
}


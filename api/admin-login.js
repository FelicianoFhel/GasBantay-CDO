import {
  createAdminToken,
  isAdminEnvConfigured,
  validateAdminCredentials,
} from './_adminAuth.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdminEnvConfigured()) {
    return res.status(503).json({
      error:
        'Admin is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SESSION_SECRET, and SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  if (!validateAdminCredentials(username, password)) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  const token = createAdminToken(username);
  return res.status(200).json({ token });
}


import { isAdminEnvConfigured, verifyAdminToken } from './_adminAuth.js';

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

async function sbFetch(path, options = {}) {
  const base = getSupabaseUrl();
  const key = getServiceRoleKey();
  const res = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { res, data, text };
}

function parseBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return null;
    }
  }
  return req.body || {};
}

function normalizeStationInput(raw) {
  const name = String(raw?.name || '').trim();
  const address = String(raw?.address || '').trim();
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { name, address: address || null, lat, lng };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!isAdminEnvConfigured()) {
    return res.status(503).json({ error: 'Admin backend is not configured.' });
  }
  const auth = verifyAdminToken(req.headers.authorization);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const out = await sbFetch('gas_stations?select=*&order=created_at.desc');
    if (!out.res.ok) return res.status(502).json({ error: 'Failed to load stations' });
    return res.status(200).json({ stations: out.data || [] });
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'Invalid JSON body' });
    const station = normalizeStationInput(body);
    if (!station) return res.status(400).json({ error: 'name, lat, lng are required' });
    const out = await sbFetch('gas_stations', { method: 'POST', body: JSON.stringify(station) });
    if (!out.res.ok) return res.status(502).json({ error: 'Failed to create station' });
    return res.status(200).json({ station: out.data?.[0] || null });
  }

  if (req.method === 'PUT') {
    const id = String(req.query?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id query is required' });
    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'Invalid JSON body' });
    const station = normalizeStationInput(body);
    if (!station) return res.status(400).json({ error: 'name, lat, lng are required' });
    const out = await sbFetch(`gas_stations?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(station),
    });
    if (!out.res.ok) return res.status(502).json({ error: 'Failed to update station' });
    return res.status(200).json({ station: out.data?.[0] || null });
  }

  if (req.method === 'DELETE') {
    const id = String(req.query?.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id query is required' });
    const out = await sbFetch(`gas_stations?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    if (!out.res.ok) return res.status(502).json({ error: 'Failed to delete station' });
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}


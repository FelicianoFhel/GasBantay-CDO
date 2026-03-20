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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function getVoteCounts(reportIds) {
  if (!reportIds.length) return { up: {}, down: {} };
  const [upOut, downOut] = await Promise.all([
    sbFetch(`upvotes?select=report_id&report_id=in.(${reportIds.join(',')})`),
    sbFetch(`downvotes?select=report_id&report_id=in.(${reportIds.join(',')})`),
  ]);
  const up = {};
  const down = {};
  reportIds.forEach((id) => {
    up[id] = 0;
    down[id] = 0;
  });
  if (!upOut.res.ok && !isMissingRelation(upOut)) {
    throw new Error('Failed to load upvotes');
  }
  if (!downOut.res.ok && !isMissingRelation(downOut)) {
    throw new Error('Failed to load downvotes');
  }
  asArray(upOut.data).forEach((r) => {
    up[r.report_id] = (up[r.report_id] || 0) + 1;
  });
  asArray(downOut.data).forEach((r) => {
    down[r.report_id] = (down[r.report_id] || 0) + 1;
  });
  return { up, down };
}

function isMissingRelation(out) {
  const msg = String(
    out?.data?.message || out?.data?.error || out?.text || ''
  ).toLowerCase();
  return msg.includes('does not exist') || msg.includes('undefined table');
}

async function setVotesAbsolute(reportId, wantUp, wantDown) {
  await sbFetch(`upvotes?report_id=eq.${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  await sbFetch(`downvotes?report_id=eq.${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  if (wantUp > 0) {
    const rows = Array.from({ length: wantUp }, (_, i) => ({
      report_id: reportId,
      fingerprint: `admin_up_${reportId}_${i + 1}`,
    }));
    await sbFetch('upvotes', { method: 'POST', body: JSON.stringify(rows) });
  }
  if (wantDown > 0) {
    const rows = Array.from({ length: wantDown }, (_, i) => ({
      report_id: reportId,
      fingerprint: `admin_down_${reportId}_${i + 1}`,
    }));
    await sbFetch('downvotes', { method: 'POST', body: JSON.stringify(rows) });
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    if (!isAdminEnvConfigured()) {
      return res.status(503).json({ error: 'Admin backend is not configured.' });
    }
    const auth = verifyAdminToken(req.headers.authorization);
    if (!auth.ok) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const stationId = String(req.query?.stationId || '').trim();
      const where = stationId ? `&station_id=eq.${encodeURIComponent(stationId)}` : '';
      const out = await sbFetch(
        `price_reports?select=id,station_id,fuel_type,price,photo_url,reported_at,created_at&order=reported_at.desc&limit=200${where}`
      );
      if (!out.res.ok) {
        if (isMissingRelation(out)) return res.status(200).json({ reports: [] });
        const hint = String(out?.data?.message || out?.data?.error || '').slice(0, 180);
        return res.status(502).json({
          error: hint ? `Failed to load reports: ${hint}` : 'Failed to load reports',
        });
      }
      const reports = Array.isArray(out.data) ? out.data : [];
      const stationIds = [...new Set(reports.map((r) => r.station_id))];
      const [stationsOut, officialOutRaw] = await Promise.all([
        stationIds.length
          ? sbFetch(`gas_stations?select=id,name,address&id=in.(${stationIds.join(',')})`)
          : Promise.resolve({ data: [] }),
        stationIds.length
          ? sbFetch(`official_station_prices?select=station_id,fuel_type,price,source_report_id&station_id=in.(${stationIds.join(',')})`)
          : Promise.resolve({ data: [] }),
      ]);
      const officialOut =
        officialOutRaw?.res?.ok || isMissingRelation(officialOutRaw)
          ? officialOutRaw
          : { data: [] };
      const byStation = {};
      asArray(stationsOut.data).forEach((s) => {
        byStation[s.id] = s;
      });
      const officialMap = {};
      asArray(officialOut.data).forEach((o) => {
        officialMap[`${o.station_id}:${o.fuel_type}`] = o;
      });
      const reportIds = reports.map((r) => r.id);
      const counts = await getVoteCounts(reportIds);
      const enriched = reports.map((r) => ({
        ...r,
        station_name: byStation[r.station_id]?.name || 'Station',
        station_address: byStation[r.station_id]?.address || null,
        upvotes: counts.up[r.id] || 0,
        downvotes: counts.down[r.id] || 0,
        is_official: Boolean(
          officialMap[`${r.station_id}:${r.fuel_type}`]?.source_report_id === r.id
        ),
      }));
      return res.status(200).json({ reports: enriched });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      if (!body) return res.status(400).json({ error: 'Invalid JSON body' });
      const action = String(body?.action || '').trim();

      if (action === 'set_votes') {
        const reportId = String(body?.report_id || '').trim();
        const upvotes = Number(body?.upvotes);
        const downvotes = Number(body?.downvotes);
        if (!reportId || !Number.isInteger(upvotes) || !Number.isInteger(downvotes)) {
          return res.status(400).json({ error: 'report_id, upvotes, downvotes required' });
        }
        if (upvotes < 0 || downvotes < 0 || upvotes > 2000 || downvotes > 2000) {
          return res.status(400).json({ error: 'Vote values out of range' });
        }
        await setVotesAbsolute(reportId, upvotes, downvotes);
        return res.status(200).json({ ok: true });
      }

      if (action === 'set_official') {
        const reportId = String(body?.report_id || '').trim();
        if (!reportId) return res.status(400).json({ error: 'report_id required' });
        const officialCheck = await sbFetch('official_station_prices?select=id&limit=1');
        if (!officialCheck.res.ok && isMissingRelation(officialCheck)) {
          return res.status(400).json({
            error:
              'official_station_prices table is missing. Run migration add_official_station_prices.sql first.',
          });
        }
        const reportOut = await sbFetch(
          `price_reports?select=id,station_id,fuel_type,price&id=eq.${encodeURIComponent(reportId)}&limit=1`
        );
        const report = reportOut.data?.[0];
        if (!report) return res.status(404).json({ error: 'Report not found' });
        const payload = {
          station_id: report.station_id,
          fuel_type: report.fuel_type,
          price: Number(report.price),
          source_report_id: report.id,
          updated_at: new Date().toISOString(),
        };
        const out = await sbFetch(
          `official_station_prices?on_conflict=station_id,fuel_type`,
          { method: 'POST', body: JSON.stringify(payload) }
        );
        if (!out.res.ok) return res.status(502).json({ error: 'Failed to set official price' });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unsupported action' });
    }

    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    const msg = String(e?.message || 'Unexpected server error');
    return res.status(500).json({ error: `Admin reports error: ${msg}` });
  }
}


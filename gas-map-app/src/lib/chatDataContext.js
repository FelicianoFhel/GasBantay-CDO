import { haversine } from './geo';
import { FUEL_TYPES } from '../constants';

function bestPricesByStation(reports, upvoteCounts, downvoteCounts) {
  const withVotes = reports.map((r) => ({
    ...r,
    likes: upvoteCounts[r.id] || 0,
    dislikes: downvoteCounts[r.id] || 0,
    score: (upvoteCounts[r.id] || 0) - (downvoteCounts[r.id] || 0),
  }));
  withVotes.sort(
    (a, b) =>
      b.score - a.score ||
      b.likes - a.likes ||
      new Date(b.reported_at || b.created_at) - new Date(a.reported_at || a.created_at)
  );
  const byStation = {};
  for (const r of withVotes) {
    if (!byStation[r.station_id]) byStation[r.station_id] = {};
    if (!byStation[r.station_id][r.fuel_type]) {
      byStation[r.station_id][r.fuel_type] = r;
    }
  }
  return byStation;
}

/**
 * Markdown block for the chat API: trusted prices from Supabase for stations in view.
 */
export async function fetchChatDataContext(supabase, stations, userPosition) {
  if (!stations?.length) {
    return '_(Walay station sa current nga lista / search.)_';
  }

  const stationIds = stations.map((s) => s.id);
  const { data: reportsData, error } = await supabase
    .from('price_reports')
    .select('*')
    .in('station_id', stationIds)
    .order('reported_at', { ascending: false });

  if (error) {
    return `_(Error loading reports: ${error.message})_`;
  }

  const reports = reportsData || [];
  let upvoteCounts = {};
  let downvoteCounts = {};

  if (reports.length > 0) {
    const reportIds = reports.map((r) => r.id);
    const { data: up } = await supabase.from('upvotes').select('report_id').in('report_id', reportIds);
    const { data: down } = await supabase.from('downvotes').select('report_id').in('report_id', reportIds);
    reportIds.forEach((id) => {
      upvoteCounts[id] = 0;
      downvoteCounts[id] = 0;
    });
    (up || []).forEach((u) => {
      upvoteCounts[u.report_id] = (upvoteCounts[u.report_id] || 0) + 1;
    });
    (down || []).forEach((u) => {
      downvoteCounts[u.report_id] = (downvoteCounts[u.report_id] || 0) + 1;
    });
  }

  const byStation =
    reports.length > 0 ? bestPricesByStation(reports, upvoteCounts, downvoteCounts) : {};

  let rows = stations.map((s) => {
    const dist = userPosition
      ? haversine(userPosition.lat, userPosition.lng, Number(s.lat), Number(s.lng))
      : null;
    const fuels = {};
    for (const { value } of FUEL_TYPES) {
      const r = byStation[s.id]?.[value];
      fuels[value] = r != null ? Number(r.price).toFixed(2) : null;
    }
    return { station: s, dist, fuels };
  });

  if (userPosition) {
    rows.sort((a, b) => (a.dist ?? 9e9) - (b.dist ?? 9e9));
  }
  rows = rows.slice(0, 18);

  const lines = [];
  lines.push(`- **Generated (UTC):** ${new Date().toISOString()}`);
  lines.push(`- **Stations in current view:** ${stations.length}`);
  lines.push(
    userPosition
      ? `- **User location (for distance):** approx lat ${userPosition.lat.toFixed(4)}, lng ${userPosition.lng.toFixed(4)} _(straight-line km; roads may differ)_`
      : '- **User location:** _not shared_ — distances show as "—"; use map for proximity.'
  );
  lines.push(`- **Total price reports loaded:** ${reports.length}`);
  lines.push('');
  lines.push('### Trusted prices (best community-scored report per fuel, per station)');
  lines.push('');
  lines.push('| Station | km | Diesel | Regular | Premium |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  for (const { station, dist, fuels } of rows) {
    const km = dist != null ? dist.toFixed(1) : '—';
    const esc = (n) => String(n).replace(/\|/g, '/');
    lines.push(
      `| ${esc(station.name)} | ${km} | ${fuels.diesel ? `₱${fuels.diesel}` : '—'} | ${fuels.regular_green ? `₱${fuels.regular_green}` : '—'} | ${fuels.premium_red ? `₱${fuels.premium_red}` : '—'} |`
    );
  }
  lines.push('');
  lines.push(
    '_Kini mga presyo gikan sa komunidad; dili opisyal nga presyo sa gas company. Kung way numero, walay trusted report karon._'
  );
  return lines.join('\n');
}

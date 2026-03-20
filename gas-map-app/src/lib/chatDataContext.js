import { haversine } from './geo';
import { FUEL_TYPES } from '../constants';

const MAX_PRICE_ROWS = 22;
/** Nearest stations surfaced for “duol nako” when location is shared */
const TOP_NEAREST = 5;

function displayStationLabel(station, allStations) {
  const name = (station.name || 'Station').trim();
  const dup = allStations.filter((s) => (s.name || '').trim() === name).length > 1;
  if (!dup) return name;
  const addr = (station.address || '').split(',')[0].trim().slice(0, 40);
  return addr ? `${name} · ${addr}` : name;
}

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

  const rows = stations.map((s) => {
    const dist =
      userPosition && s.lat != null && s.lng != null
        ? haversine(userPosition.lat, userPosition.lng, Number(s.lat), Number(s.lng))
        : null;
    const fuels = {};
    for (const { value } of FUEL_TYPES) {
      const r = byStation[s.id]?.[value];
      const p = r != null && r.price != null ? Number(r.price) : NaN;
      fuels[value] = Number.isFinite(p) ? p.toFixed(2) : null;
    }
    const hasPrice = FUEL_TYPES.some(({ value }) => fuels[value] != null);
    return { station: s, dist, fuels, hasPrice };
  });

  const sortedForDistance = [...rows].sort((a, b) => {
    if (userPosition) return (a.dist ?? 9e9) - (b.dist ?? 9e9);
    return (a.station.name || '').localeCompare(b.station.name || '', undefined, {
      sensitivity: 'base',
    });
  });
  const stationsWithPriceCount = rows.filter((r) => r.hasPrice).length;

  const nearestWithDist = sortedForDistance.filter(
    (r) => r.dist != null && Number.isFinite(r.dist)
  );
  const top5Nearest = nearestWithDist.slice(0, TOP_NEAREST);
  const top5Ids = new Set(top5Nearest.map((r) => r.station.id));
  const hasTop5 = Boolean(userPosition && top5Nearest.length > 0);

  const pricedElsewhere = hasTop5
    ? sortedForDistance.filter((r) => r.hasPrice && !top5Ids.has(r.station.id)).slice(0, MAX_PRICE_ROWS)
    : sortedForDistance.filter((r) => r.hasPrice).slice(0, MAX_PRICE_ROWS);

  const lines = [];
  lines.push('### Snapshot (read-only; authoritative for this chat turn)');
  lines.push(`- **Generated (UTC):** ${new Date().toISOString()}`);
  lines.push(`- **Stations in current map/search list:** ${stations.length}`);
  lines.push(
    userPosition
      ? `- **User location:** shared (approx lat ${userPosition.lat.toFixed(4)}, lng ${userPosition.lng.toFixed(4)}) — distances are **straight-line km** (roads may differ). **Primary “near me” list:** **top ${TOP_NEAREST} nearest** stations below.`
      : '- **User location:** **not shared** — suggest **Turn on location** in the chat panel (or dashboard) for top 5 nearest + distances.'
  );
  lines.push(`- **Community price rows loaded from DB (this view):** ${reports.length}`);
  lines.push(
    `- **Stations with at least one reported price (Diesel / Regular / Premium):** ${stationsWithPriceCount}`
  );
  lines.push('');
  lines.push(
    '**Assistant rules (from app):** Do **not** copy-paste this entire block as the user reply. Do **not** output a large markdown table where **every** price cell is "—". If `stationsWithPriceCount` is 0, give a **short, professional** answer: status + 2–3 concrete next steps. Use **one** language (mirror the user; default Bisaya) — avoid repeating the same paragraph in English then Bisaya. For “near me” with location on, **lead with the Top 5 nearest** section.'
  );
  lines.push('');

  const esc = (n) => String(n).replace(/\|/g, '/');

  if (hasTop5) {
    const anyPriceInTop5 = top5Nearest.some((r) => r.hasPrice);
    lines.push(`### Top ${TOP_NEAREST} nearest stations (current search/list)`);
    lines.push('');
    if (anyPriceInTop5) {
      lines.push('| Station | km | Diesel | Regular | Premium |');
      lines.push('| --- | ---: | ---: | ---: | ---: |');
      for (const { station, dist, fuels } of top5Nearest) {
        const label = esc(displayStationLabel(station, stations));
        lines.push(
          `| ${label} | ${dist.toFixed(1)} | ${fuels.diesel ? `₱${fuels.diesel}` : '—'} | ${fuels.regular_green ? `₱${fuels.regular_green}` : '—'} | ${fuels.premium_red ? `₱${fuels.premium_red}` : '—'} |`
        );
      }
    } else {
      lines.push(
        '_Walay community presyo sa database para sa top 5 nga pinakaduol; gilay-on lang aron makit-an kung asa ang pinakaduol._'
      );
      lines.push('');
      lines.push('| Station | km |');
      lines.push('| --- | ---: |');
      for (const { station, dist } of top5Nearest) {
        lines.push(`| ${esc(displayStationLabel(station, stations))} | ${dist.toFixed(1)} |`);
      }
    }
    lines.push('');
    lines.push(
      '_Disclaimer: community-submitted prices only; not official station or oil-company prices._'
    );
    lines.push('');
  }

  if (pricedElsewhere.length > 0) {
    lines.push(
      hasTop5
        ? '### Other stations in this view with community-reported prices'
        : '### Stations with community-reported prices (trusted pick per fuel)'
    );
    lines.push('');
    lines.push('| Station | km | Diesel | Regular | Premium |');
    lines.push('| --- | ---: | ---: | ---: | ---: |');
    for (const { station, dist, fuels } of pricedElsewhere) {
      const label = esc(displayStationLabel(station, stations));
      const km = dist != null && Number.isFinite(dist) ? dist.toFixed(1) : '—';
      lines.push(
        `| ${label} | ${km} | ${fuels.diesel ? `₱${fuels.diesel}` : '—'} | ${fuels.regular_green ? `₱${fuels.regular_green}` : '—'} | ${fuels.premium_red ? `₱${fuels.premium_red}` : '—'} |`
      );
    }
    lines.push('');
    lines.push(
      '_Disclaimer: community-submitted prices only; not official station or oil-company prices._'
    );
  } else if (!hasTop5 && stationsWithPriceCount === 0) {
    lines.push('### No community prices for stations in this view');
    lines.push('');
    lines.push(
      '_Walay presyo sa database alang sa mga estasyon sa listahan karon. Ayaw pagbuhat og markdown table nga puno og "—" sa presyo._'
    );
    lines.push(
      '_Kung ang tiggamit mangutana og “duol nako”, hangyoa sila nga i-on ang **lokasyon sa chat** o **Use my location** sa dashboard._'
    );
    lines.push('');
  }

  return lines.join('\n');
}

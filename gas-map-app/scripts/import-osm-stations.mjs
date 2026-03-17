import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const SOUTH = 8.35;
const WEST = 124.55;
const NORTH = 8.62;
const EAST = 124.78;

function normalizeName(name = '') {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function sqlText(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function pickName(tags = {}) {
  if (tags.name) return tags.name.trim();
  const brand = tags.brand || tags.operator || 'Fuel Station';
  const street = tags['addr:street'] || tags['addr:place'] || 'CDO';
  return `${brand} (${street})`;
}

function pickAddress(tags = {}) {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'] || tags['addr:place'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:municipality'],
  ].filter(Boolean);
  const addr = parts.join(' ').trim();
  return addr || null;
}

function dedupeStations(items) {
  const seen = new Set();
  const out = [];
  for (const s of items) {
    const key = `${normalizeName(s.name)}|${Number(s.lat).toFixed(4)}|${Number(s.lng).toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

async function fetchOverpassStations() {
  const query = `
[out:json][timeout:45];
(
  node["amenity"="fuel"](${SOUTH},${WEST},${NORTH},${EAST});
  way["amenity"="fuel"](${SOUTH},${WEST},${NORTH},${EAST});
  relation["amenity"="fuel"](${SOUTH},${WEST},${NORTH},${EAST});
);
out center tags;
`;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) {
    throw new Error(`Overpass request failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  const elements = data.elements || [];
  const mapped = elements
    .map((el) => {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat === undefined || lng === undefined) return null;
      const tags = el.tags || {};
      return {
        name: pickName(tags),
        lat: Number(lat),
        lng: Number(lng),
        address: pickAddress(tags),
      };
    })
    .filter(Boolean)
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  return dedupeStations(mapped);
}

function toSql(stations) {
  const lines = [];
  lines.push('-- Auto-generated from OpenStreetMap Overpass (amenity=fuel)');
  lines.push(`-- Generated at: ${new Date().toISOString()}`);
  lines.push(`-- Bounding box: (${SOUTH}, ${WEST}) to (${NORTH}, ${EAST})`);
  lines.push('');
  lines.push('-- Review first before executing in production');
  lines.push('truncate table public.gas_stations cascade;');
  lines.push('');
  lines.push('insert into public.gas_stations (name, lat, lng, address) values');
  stations.forEach((s, i) => {
    const suffix = i === stations.length - 1 ? ';' : ',';
    lines.push(
      `  (${sqlText(s.name)}, ${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}, ${sqlText(s.address)})${suffix}`
    );
  });
  lines.push('');
  return lines.join('\n');
}

async function applyToSupabase(stations) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_URL in environment.');
  if (!serviceKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in environment.');

  const supabase = createClient(url, serviceKey);

  const { error: deleteError } = await supabase.from('gas_stations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);

  const { error: insertError } = await supabase.from('gas_stations').insert(stations);
  if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
}

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--apply');

  console.log('Fetching fuel stations from Overpass...');
  const stations = await fetchOverpassStations();
  if (!stations.length) {
    throw new Error('No stations returned from Overpass. Try again later.');
  }

  console.log(`Found ${stations.length} unique stations in CDO bounds.`);

  const sql = toSql(stations);
  const outFile = path.join(appRoot, 'supabase', 'imported-cdo-stations.sql');
  await fs.writeFile(outFile, sql, 'utf8');
  console.log(`Wrote SQL file: ${outFile}`);

  if (applyMode) {
    console.log('Applying directly to Supabase...');
    await applyToSupabase(stations);
    console.log('Supabase import complete.');
  } else {
    console.log('Dry run only. Execute the generated SQL in Supabase, or rerun with --apply.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

# CDO Gas Price Map

Live gas price map for Cagayan de Oro: view stations on a map, see latest reported prices, submit prices, and upvote reports.

## Stack

- **Frontend:** React + Vite
- **Backend/DB/Auth:** Supabase (free tier)
- **Map:** Leaflet + OpenStreetMap
- **Deploy:** Vercel (free tier)

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the script in `supabase/schema.sql` to create tables, RLS policies, and seed CDO stations.
3. In Project Settings → API, copy the **Project URL** and **anon public** key.

### 2. Local env

```bash
cp .env.example .env
```

Edit `.env` and set:

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon key

### 3. Install and run

```bash
npm install
npm run dev
```

Open http://localhost:5173

### 4. Deploy to Vercel

1. Push this repo to GitHub (or connect Vercel to your repo).
2. In Vercel: **Add New Project** → import the repo.
3. Set **Root Directory** to `gas-map-app` (or the folder that contains this app).
4. Add **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy from the **repository root** (where the root `vercel.json` and `api/` folder live), not only this subfolder, so `/api/chat` is included.
6. **Groq chat assistant:** add **`GROQ_API_KEY`** in Vercel → Project → Settings → Environment Variables (server-side; do not prefix with `VITE_`). The floating **Assistant** button calls `/api/chat`. Photo AI still uses **`VITE_GROQ_API_KEY`** in the frontend if you use that feature.
7. **Local dev:** `npm run dev` does not serve `/api`. Either run `npx vercel dev` from the repo root, or set **`VITE_CHAT_API_URL`** in `.env` to your deployed API base, e.g. `https://your-project.vercel.app/api`.

## Features (MVP)

- Map centered on Cagayan de Oro with bounds
- Gas station markers from Supabase
- Click a station → panel with latest prices and “Updated X ago”
- Submit a new price (fuel type + amount)
- Upvote price reports (one per anonymous fingerprint per report)

## Import real stations from OpenStreetMap (free)

You can bootstrap real fuel stations in Cagayan de Oro using Overpass (OSM data), without Google billing.

1. Install dependencies:

```bash
npm install
```

2. Run dry-run importer (fetches OSM stations and generates SQL file):

```bash
npm run import:stations:osm
```

This creates `supabase/imported-cdo-stations.sql`.

3. Open Supabase SQL Editor and run the generated SQL file.

Optional direct apply (no SQL copy/paste):

```bash
npm run import:stations:osm:apply
```

For direct apply, set `SUPABASE_SERVICE_ROLE_KEY` in your local `.env` first.

Notes:
- Import scope is fixed to CDO bounds used by the app.
- Generated SQL uses `truncate table public.gas_stations cascade;` so it will remove existing stations and related reports/upvotes.
- Always review imported station names/locations before production use.

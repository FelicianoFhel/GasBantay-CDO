-- Live Gas Price Map - Cagayan de Oro
-- Run this in Supabase SQL Editor (Dashboard -> SQL Editor -> New query)

-- 1. Tables
create table if not exists public.gas_stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat decimal not null,
  lng decimal not null,
  address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.price_reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.gas_stations(id) on delete cascade,
  fuel_type text not null check (fuel_type in ('diesel', 'regular_green', 'premium_red')),
  price decimal not null check (price >= 50 and price <= 150),
  photo_url text,
  reported_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.upvotes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.price_reports(id) on delete cascade,
  fingerprint text not null,
  created_at timestamptz default now(),
  unique(report_id, fingerprint)
);

create table if not exists public.downvotes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.price_reports(id) on delete cascade,
  fingerprint text not null,
  created_at timestamptz default now(),
  unique(report_id, fingerprint)
);

create index if not exists idx_price_reports_station_id on public.price_reports(station_id);
create index if not exists idx_price_reports_reported_at on public.price_reports(reported_at desc);
create index if not exists idx_upvotes_report_id on public.upvotes(report_id);
create index if not exists idx_downvotes_report_id on public.downvotes(report_id);

-- 2. RLS
alter table public.gas_stations enable row level security;
alter table public.price_reports enable row level security;
alter table public.upvotes enable row level security;
alter table public.downvotes enable row level security;

create policy "Anyone can read gas_stations"
  on public.gas_stations for select using (true);

create policy "Anyone can read price_reports"
  on public.price_reports for select using (true);

create policy "Anyone can insert price_reports"
  on public.price_reports for insert with check (true);

create policy "Anyone can read upvotes"
  on public.upvotes for select using (true);

create policy "Anyone can insert upvotes"
  on public.upvotes for insert with check (true);

create policy "Anyone can read downvotes"
  on public.downvotes for select using (true);

create policy "Anyone can insert downvotes"
  on public.downvotes for insert with check (true);

create policy "Anyone can delete upvotes"
  on public.upvotes for delete using (true);

create policy "Anyone can delete downvotes"
  on public.downvotes for delete using (true);

-- 3. Seed CDO gas stations (Cagayan de Oro area)
insert into public.gas_stations (name, lat, lng, address) values
  ('Petron Carmen', 8.4789, 124.6432, 'Carmen, Cagayan de Oro'),
  ('Shell Macabalan', 8.4721, 124.6512, 'Macabalan, Cagayan de Oro'),
  ('Caltex Bulua', 8.4654, 124.6389, 'Bulua, Cagayan de Oro'),
  ('Unioil Kauswagan', 8.4887, 124.6521, 'Kauswagan, Cagayan de Oro'),
  ('Petron Gusa', 8.4923, 124.6287, 'Gusa, Cagayan de Oro'),
  ('Shell Lapasan', 8.4756, 124.6354, 'Lapasan, Cagayan de Oro'),
  ('Petron Puerto', 8.4689, 124.6478, 'Puerto, Cagayan de Oro'),
  ('Caltex Agusan', 8.4856, 124.6412, 'Agusan, Cagayan de Oro'),
  ('Phoenix Balulang', 8.4612, 124.6312, 'Balulang, Cagayan de Oro'),
  ('Seaoil Cogon', 8.4812, 124.6472, 'Cogon, Cagayan de Oro'),
  ('Total Carmen', 8.4767, 124.6398, 'Carmen, Cagayan de Oro'),
  ('Chevron Bugo', 8.5123, 124.6123, 'Bugo, Cagayan de Oro'),
  ('Petron Tablon', 8.5021, 124.6589, 'Tablon, Cagayan de Oro'),
  ('Shell Nazareth', 8.4589, 124.6523, 'Nazareth, Cagayan de Oro')
;

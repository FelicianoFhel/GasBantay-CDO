create table if not exists public.official_station_prices (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.gas_stations(id) on delete cascade,
  fuel_type text not null check (fuel_type in ('diesel', 'regular_green', 'premium_red')),
  price decimal not null check (price >= 50 and price <= 150),
  source_report_id uuid references public.price_reports(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(station_id, fuel_type)
);

create index if not exists idx_official_station_prices_station_id
  on public.official_station_prices(station_id);

alter table public.official_station_prices enable row level security;

do $$
begin
  create policy "Anyone can read official_station_prices"
    on public.official_station_prices for select using (true);
exception
  when duplicate_object then null;
end$$;


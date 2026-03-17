-- Fix / replace CDO gas stations (run in Supabase SQL Editor if you already have tables)
-- WARNING: This deletes all gas_stations and, via CASCADE, all price_reports and upvotes.
-- Run only on a fresh or disposable dataset, or backup first.

truncate table public.gas_stations cascade;

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

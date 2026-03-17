-- Enforce price between 50 and 150 PHP (run in Supabase SQL Editor if table already exists)
alter table public.price_reports drop constraint if exists price_reports_price_check;
alter table public.price_reports add constraint price_reports_price_check
  check (price >= 50 and price <= 150);

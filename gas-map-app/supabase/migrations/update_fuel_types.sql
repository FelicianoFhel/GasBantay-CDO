-- Update fuel_type allowed values (run in Supabase SQL Editor if you have existing data)
-- New values: diesel, regular_green, premium_red (labels: Diesel, Regular(Green), Premium(Red))
-- Run this so "Submit price" accepts Diesel, Regular(Green), Premium(Red).

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'price_reports' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%fuel_type%'
  loop
    execute format('alter table public.price_reports drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.price_reports add constraint price_reports_fuel_type_check
  check (fuel_type in ('diesel', 'regular_green', 'premium_red'));

-- Optional: migrate old values to new (uncomment if you had unleaded/premium and want to keep rows)
-- update public.price_reports set fuel_type = 'regular_green' where fuel_type = 'unleaded';
-- update public.price_reports set fuel_type = 'premium_red' where fuel_type = 'premium';

-- Add downvotes table to support dislike votes on reports
create table if not exists public.downvotes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.price_reports(id) on delete cascade,
  fingerprint text not null,
  created_at timestamptz default now(),
  unique(report_id, fingerprint)
);

create index if not exists idx_downvotes_report_id on public.downvotes(report_id);

alter table public.downvotes enable row level security;

create policy "Anyone can read downvotes"
  on public.downvotes for select using (true);

create policy "Anyone can insert downvotes"
  on public.downvotes for insert with check (true);

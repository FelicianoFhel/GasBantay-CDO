-- Add optional photo URL to price reports (run in Supabase SQL Editor if table already exists)
ALTER TABLE public.price_reports ADD COLUMN IF NOT EXISTS photo_url text;

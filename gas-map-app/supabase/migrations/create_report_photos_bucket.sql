-- Create report-photos storage bucket and allow public upload/read
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor) if you get 400 on photo upload.

-- 1. Create the bucket (id and name = report-photos, public so images are viewable by URL)
insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do update set public = true;

-- 2. Allow anyone to read objects in this bucket
create policy "Public read report-photos"
on storage.objects for select
using (bucket_id = 'report-photos');

-- 3. Allow anyone to upload (insert) into this bucket
create policy "Public insert report-photos"
on storage.objects for insert
with check (bucket_id = 'report-photos');

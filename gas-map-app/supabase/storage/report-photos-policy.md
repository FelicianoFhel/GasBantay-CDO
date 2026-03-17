# Report photos bucket

The app uploads to the `report-photos` bucket and saves the public URL in `price_reports.photo_url`. If you get **400 Bad Request** on upload, the bucket or its policies are missing.

## Option A: Run SQL (recommended)

In Supabase Dashboard → **SQL Editor** → New query, run the script:

**`supabase/migrations/create_report_photos_bucket.sql`**

That creates the bucket (public, 5MB limit, images only) and policies so anyone can read and upload.

## Option B: Dashboard

1. **Storage** → **New bucket** → Name: `report-photos`
2. **Public bucket**: ON
3. **Policies** → New policy:
   - **For SELECT**: policy name e.g. "Public read", USING: `bucket_id = 'report-photos'`
   - **For INSERT**: policy name e.g. "Public insert", WITH CHECK: `bucket_id = 'report-photos'`

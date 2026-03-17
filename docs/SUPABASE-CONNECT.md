# Using Supabase with this project

## 1. Gas Map (React) — already using Supabase

The CDO Gas Price Map at `/gas-map/` uses Supabase via the **API** (browser). No Laravel DB connection needed.

- **Env:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the main `.env`
- **Tables:** Run `gas-map-app/supabase/schema.sql` in Supabase **SQL Editor** once. Then rebuild: `cd gas-map-app && npm run build`

## 2. Laravel database (optional) — Supabase Postgres

If you want Laravel (users, migrations, etc.) to use Supabase Postgres, the main `.env` is already set. If you get **"Unknown host"**:

### Option A: Fix DNS (recommended)

1. **Flush DNS:** In PowerShell run `ipconfig /flushdns`
2. **Use Google DNS:** Windows → Network settings → your connection → IPv4 → Preferred DNS: `8.8.8.8`, Alternate: `8.8.4.4`
3. Restart Laragon and run `php artisan migrate` again

### Option B: Use Supabase connection pooler

Sometimes the pooler host resolves when the direct host does not:

1. In **Supabase Dashboard** go to **Project Settings** → **Database**
2. Under **Connection string** switch to **Connection pooling** (e.g. **Transaction** mode)
3. Copy the URI. It looks like:  
   `postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres`
4. In `.env` set:
   - `DATABASE_URL` = that URI with `?sslmode=require` at the end (encode `@` in password as `%40`)
   - `DB_HOST` = `aws-0-REGION.pooler.supabase.com` (your actual region)
   - `DB_PORT` = `6543`
   - `DB_USERNAME` = `postgres.gloahehffbyhkpnaqscx` (postgres.PROJECT_REF)
   - `DB_PASSWORD` = your database password
   - Keep `DB_DATABASE=postgres`, `DB_CONNECTION=pgsql`, `DB_SSLMODE=require`

Then run `php artisan migrate`.

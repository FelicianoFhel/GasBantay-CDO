import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vercel sets VERCEL=1 and VERCEL_ENV during builds; either must trigger dist + base /
const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

export default defineConfig({
  plugins: [react()],
  base: isVercel ? '/' : '/gas-map/',
  // Load .env from project root so VITE_SUPABASE_* in main .env are used (local only)
  ...(isVercel ? {} : { envDir: path.resolve(__dirname, '..') }),
  build: {
    outDir: isVercel ? 'dist' : path.resolve(__dirname, '../public/gas-map'),
    emptyDir: true,
  },
});

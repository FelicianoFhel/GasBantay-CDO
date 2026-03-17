import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vercel sets VERCEL=1; use truthy check so we output to dist and base /
const isVercel = Boolean(process.env.VERCEL);

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

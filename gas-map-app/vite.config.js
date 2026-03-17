import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/gas-map/',
  // Load .env from project root so VITE_SUPABASE_* in main .env are used
  envDir: path.resolve(__dirname, '..'),
  build: {
    outDir: '../public/gas-map',
    emptyDir: true,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // VITE_* is the default; NEXT_PUBLIC_* lets the Vercel ↔ Supabase integration's public variables work without renaming.
  // Only these prefixes reach the browser — SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY etc. never do.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  server: { port: 5173 },
  build: { sourcemap: false },
});

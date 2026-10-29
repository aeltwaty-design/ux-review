// Optional: runs supabase/seed.sql through the Supabase SQL API when you prefer the terminal over the SQL editor.
// Usage: SUPABASE_DB_URL="postgresql://..." npm run seed   (connection string from Supabase → Settings → Database)
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error('Set SUPABASE_DB_URL (Supabase → Settings → Database → connection string).'); process.exit(1); }
for (const file of ['supabase/migrations/0001_init.sql', 'supabase/seed.sql']) {
  const r = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', file], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`psql failed on ${file} (is psql installed?)`); process.exit(r.status ?? 1); }
  console.log('applied', file);
}
void readFileSync;

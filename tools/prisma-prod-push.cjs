/*
  Apply Prisma schema to the PRODUCTION database (Postgres) using the env pulled from Vercel.

  Why: production is missing tables (e.g. public.Project), causing runtime errors.

  Usage:
    1) vercel env pull .env.vercel.production --yes --environment=production
    2) node tools/prisma-prod-push.cjs

  Notes:
    - This trims CR/LF from values (Vercel env pull sometimes includes \r\n).
    - Uses `prisma db push` (no migrations folder in this repo currently).
*/

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envPath = path.join(process.cwd(), '.env.vercel.production');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env.vercel.production. Run: vercel env pull .env.vercel.production --yes --environment=production');
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
const env = { ...process.env };

for (const line of content.split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const m = line.match(/^([^=]+)=(.*)$/);
  if (!m) continue;
  const key = m[1].trim();
  let val = m[2].trim();
  // strip wrapping quotes
  val = val.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  // trim stray CR/LF and whitespace
  val = val.replace(/\r/g, '').trim();
  env[key] = val;
}

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL missing in env file');
  process.exit(1);
}

console.log('Running: npx prisma db push (production)');

const res = spawnSync('npx', ['prisma', 'db', 'push'], {
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(res.status ?? 1);

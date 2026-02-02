/*
  Sync/clean Vercel Production env vars (strip CR/LF, fix empty values).

  Why:
  - `vercel env pull` sometimes writes values with trailing \r\n.
  - Production had GOOGLE_CLIENT_ID empty (breaks some server-side flows).

  Usage:
    node tools/vercel-env-sync.cjs

  Notes:
  - Requires Vercel CLI logged in and linked project.
  - Uses `vercel env add <name> production --force` with stdin.
*/

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    val = val.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    val = val.replace(/\r/g, '').trim();
    out[key] = val;
  }
  return out;
}

const localEnv = parseEnvFile(path.join(process.cwd(), '.env.local'));
const vercelProdPulled = parseEnvFile(path.join(process.cwd(), '.env.vercel.production'));

function pick(key) {
  return (localEnv[key] ?? vercelProdPulled[key] ?? '').toString().replace(/\r/g, '').trim();
}

// Keys we want to ensure are clean in production.
// (Keep list explicit to avoid accidentally overwriting unintended vars.)
const keys = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'JWT_SECRET',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'ASR_BASE_URL',
  'REDIS_URL',
  'BLOB_READ_WRITE_TOKEN',
  'R2_ACCOUNT_ID',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE_URL',
];

// Which keys should be treated as sensitive in Vercel (hidden in UI)
const sensitive = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'DATABASE_URL',
  'DIRECT_URL',
  'GOOGLE_CLIENT_SECRET',
  'JWT_SECRET',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'REDIS_URL',
  'BLOB_READ_WRITE_TOKEN',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
]);

let ok = 0;
let fail = 0;

for (const key of keys) {
  const value = pick(key);
  if (!value) {
    console.warn(`[skip] ${key} is empty locally/pulled; not overwriting.`);
    continue;
  }

  const args = ['env', 'add', key, 'production', '--force'];
  if (sensitive.has(key)) args.push('--sensitive');

  const res = spawnSync('vercel', args, {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
  });

  if (res.status === 0) ok++;
  else {
    fail++;
    console.error(`[fail] ${key} (exit ${res.status})`);
  }
}

console.log(`\nDone. Updated: ${ok}, Failed: ${fail}`);
process.exit(fail ? 1 : 0);

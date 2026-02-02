/*
  Migrates API routes that still use legacy getSession(req) to the async
  getSessionFromRequest(req) which supports Supabase access tokens.

  Usage: node tools/migrate-supabase-auth.cjs
*/

const fs = require('fs');
const path = require('path');

const API_DIR = path.join(process.cwd(), 'api');

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const files = walk(API_DIR)
  .filter((p) => !p.includes(path.join('api', '_lib')))
  .filter((p) => !p.endsWith(path.join('api', 'credits', 'index.ts')));

let changed = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes('getSession(req)')) continue;

  let next = src;

  // Replace any import from ../_lib/auth.js that includes getSession
  next = next.replace(
    /import\s+\{([^}]*?)\}\s+from\s+(['"])\.\.\/_lib\/auth\.js\2/g,
    (m, namesRaw, quote) => {
      const names = namesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (!names.includes('getSession')) return m; // leave untouched

      const filtered = names.filter((n) => n !== 'getSession');
      filtered.push('getSessionFromRequest');
      const uniq = [...new Set(filtered)];
      return `import { ${uniq.join(', ')} } from ${quote}../_lib/auth.js${quote}`;
    }
  );

  // Replace calls
  next = next.replace(/const\s+session\s*=\s*getSession\(req\)/g, 'const session = await getSessionFromRequest(req)');

  if (next !== src) {
    fs.writeFileSync(file, next, 'utf8');
    changed++;
    console.log('updated', path.relative(process.cwd(), file));
  }
}

console.log(`\nDone. Updated ${changed} file(s).`);

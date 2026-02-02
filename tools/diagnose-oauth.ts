// ============================================================================
// OAUTH DIAGNOSTIC TOOL
// ============================================================================
// This script checks your local configuration and generates the exact URLs
// you need to whitelist in Google Cloud and Supabase.
//
// Usage: npx tsx tools/diagnose-oauth.ts
// ============================================================================

import fs from 'fs';
import path from 'path';

console.log('🔍 TM-IA OAuth Diagnostic Tool\n');

// 1. Load Environment Variables
const envLocalPath = path.join(process.cwd(), '.env.local');
let envContent = '';

try {
  envContent = fs.readFileSync(envLocalPath, 'utf-8');
} catch (e) {
  console.error('❌ Error: Could not read .env.local file.');
  process.exit(1);
}

// Parse env (simple regex parser)
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }
});

// 2. Extract Key Variables
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const googleClientId = env.GOOGLE_CLIENT_ID;

console.log('--- Configuration Check ---');

if (supabaseUrl) {
  console.log(`✅ Supabase URL:       ${supabaseUrl}`);
} else {
  console.log(`❌ Supabase URL:       MISSING (VITE_SUPABASE_URL)`);
}

if (supabaseAnonKey) {
  console.log(`✅ Supabase Anon Key:  Present (${supabaseAnonKey.substring(0, 10)}...)`);
} else {
  console.log(`❌ Supabase Anon Key:  MISSING (VITE_SUPABASE_ANON_KEY)`);
}

if (googleClientId) {
  console.log(`✅ Google Client ID:   ${googleClientId}`);
} else {
  console.log(`❌ Google Client ID:   MISSING (GOOGLE_CLIENT_ID)`);
}

console.log('\n--- Required Actions ---');

// 3. Generate Actions
if (supabaseUrl && googleClientId) {
  const supabaseProjectRef = supabaseUrl.split('.')[0].replace('https://', '');
  const supabaseCallbackUrl = `${supabaseUrl}/auth/v1/callback`;

  console.log('1️⃣  Enable Google Provider in Supabase Dashboard:');
  console.log(`    URL: https://supabase.com/dashboard/project/${supabaseProjectRef}/auth/providers`);
  console.log('    Action: Toggle "Google" to ON.');
  console.log('    Paste Client ID:', googleClientId);
  console.log('\n');

  console.log('2️⃣  Configure Redirect URI in Google Cloud Console:');
  console.log('    URL: https://console.cloud.google.com/apis/credentials');
  console.log('    Action: Edit your OAuth 2.0 Client ID.');
  console.log('    Add this EXACT URL to "Authorized redirect URIs":');
  console.log(`    👉 ${supabaseCallbackUrl}`);
  console.log('\n');

  console.log('3️⃣  Verify Supabase Site URL:');
  console.log(`    URL: https://supabase.com/dashboard/project/${supabaseProjectRef}/auth/url-configuration`);
  console.log('    Site URL: https://tm-ia.vercel.app');
  console.log('    Redirect URLs:');
  console.log('      - http://localhost:5173');
  console.log('      - https://tm-ia.vercel.app/auth/callback');
  console.log('      - https://tm-ia.vercel.app/**');
}

// 4. Connectivity Test
console.log('\n--- Connectivity Test ---');
if (supabaseUrl && supabaseAnonKey) {
  fetch(`${supabaseUrl}/auth/v1/health`, {
    headers: { 'apikey': supabaseAnonKey }
  })
  .then(res => {
    if (res.ok) {
      console.log('✅ Supabase Connection: OK (Health check passed)');
    } else {
      console.log(`❌ Supabase Connection: Failed (Status ${res.status})`);
    }
  })
  .catch(err => {
    console.log('❌ Supabase Connection: Error', err.message);
  });
} else {
  console.log('⚠️ Skipping connectivity test (missing config)');
}

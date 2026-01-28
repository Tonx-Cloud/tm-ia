// ============================================================================
// DEVELOPMENT API SERVER
// ============================================================================
// IMPORTANT: Do NOT modify timeout/keepAlive settings!
// 
// This server handles file uploads which require:
// 1. Long request timeouts (5 minutes) for large audio files
// 2. Keep-alive connections to prevent premature disconnection
// 3. No body parsing for multipart/form-data (handled by busboy in handlers)
//
// If you experience ERR_CONNECTION_RESET during uploads, check:
// 1. That the timeout settings below are not reduced
// 2. That multipart requests are not being consumed before reaching the handler
// ============================================================================

import http from 'http';
import url from 'url';
import path from 'path';
import fs from 'fs';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'url';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3004;
const API_ROOT = path.join(process.cwd(), 'api');

// Timeout settings for uploads (5 minutes)
const REQUEST_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const KEEP_ALIVE_TIMEOUT = 65 * 1000; // 65 seconds (slightly longer than typical client timeout)
const HEADERS_TIMEOUT = 60 * 1000; // 60 seconds for headers

// --- Load .env manually for local dev ---
try {
  const envFiles = ['.env', '.env.local'];
  
  envFiles.forEach(file => {
    const envPath = path.join(process.cwd(), file);
    if (fs.existsSync(envPath)) {
      console.log(`Loading environment from ${file}`);
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
          // .env.local overrides .env, so we simply assign (or only assign if missing for .env order? No, usually local overrides)
          // Actually, if we iterate .env then .env.local, we should overwrite.
          if (key && value) {
            process.env[key] = value;
          }
        }
      });
    }
  });
} catch (err) {
  console.error('Failed to load env files:', err);
}

// Set defaults ONLY if missing (allow .env to override)
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'dev-secret-fallback';
if (!process.env.DEV_TOKEN) process.env.DEV_TOKEN = 'dev-token';

// Helper to find the correct file for a route
function resolveRoute(routePath: string) {
  // Remove /api prefix
  const relativePath = routePath.replace(/^\/api/, '');
  
  // Try direct ts file (e.g., /api/auth/google -> api/auth/google.ts)
  let tryPath = path.join(API_ROOT, relativePath + '.ts');
  if (fs.existsSync(tryPath)) return tryPath;

  // Try index.ts in folder (e.g., /api/upload -> api/upload/index.ts)
  tryPath = path.join(API_ROOT, relativePath, 'index.ts');
  if (fs.existsSync(tryPath)) return tryPath;

  // Try nested folder structure (e.g., /api/auth/google/callback -> api/auth/google/callback.ts)
  // Already covered by first check, but let's be explicit
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length >= 2) {
    // Try as nested ts file
    tryPath = path.join(API_ROOT, ...parts) + '.ts';
    if (fs.existsSync(tryPath)) return tryPath;
    
    // Try as nested index
    tryPath = path.join(API_ROOT, ...parts, 'index.ts');
    if (fs.existsSync(tryPath)) return tryPath;
  }

  return null;
}

// Polyfill Vercel/Express helpers
function enhanceReqRes(req: any, res: any, urlParts: url.UrlWithParsedQuery) {
  // req.query
  req.query = urlParts.query || {};
  
  // req.cookies (dummy)
  req.cookies = {};

  // res.status
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };

  // res.json
  res.json = (body: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };

  // res.send
  res.send = (body: any) => {
    if (typeof body === 'object') {
      res.json(body);
    } else {
      res.end(body);
    }
    return res;
  };
}

const server = http.createServer(async (req, res) => {
  // Set request timeout for long uploads
  req.setTimeout(REQUEST_TIMEOUT);
  res.setTimeout(REQUEST_TIMEOUT);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', `timeout=${KEEP_ALIVE_TIMEOUT / 1000}`);

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url || '', true);
  const routeFile = resolveRoute(parsedUrl.pathname || '');

  console.log(`[${req.method}] ${parsedUrl.pathname} -> ${routeFile ? routeFile : 'NOT FOUND'}`);

  if (!routeFile) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    const contentType = req.headers['content-type'] || '';
    const isMultipart = contentType.includes('multipart/form-data');
    
    // Body parsing for JSON only - leave multipart streams untouched
    if ((req.method === 'POST' || req.method === 'PUT') && !isMultipart) {
      if (contentType.includes('application/json')) {
        const buffers: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          req.on('data', (chunk: Buffer) => buffers.push(chunk));
          req.on('end', () => resolve());
          req.on('error', reject);
        });
        const data = Buffer.concat(buffers).toString();
        if (data) {
          (req as any).body = JSON.parse(data);
        }
      }
    }
    // IMPORTANT: Multipart forms (upload) are handled by the handler itself using busboy
    // We must NOT consume the stream here for routes that need raw body access

    enhanceReqRes(req, res, parsedUrl);

    // Dynamic import of the API handler
    // We append a timestamp to bypass cache if needed, though for dev-server usually import is cached.
    // Ideally we would clear require cache for hot reload, but simple import is enough for now.
    // Bust module cache on every request to ensure latest code
    // Use proper file URL for Windows paths
    const moduleUrl = new URL(pathToFileURL(routeFile).href);
    moduleUrl.searchParams.set('v', String(Date.now()));
    const module = await import(moduleUrl.href);
    const handler = module.default;

    if (typeof handler === 'function') {
      // Create a context object mock
      const ctx = { requestId: 'dev-' + Date.now(), userId: 'dev-user' };
      // Call with ctx only if handler expects 3 args
      if (handler.length >= 3) {
        await handler(req, res, ctx);
      } else {
        await handler(req, res);
      }
    } else {
      throw new Error('Module does not export a default function');
    }

  } catch (err) {
    console.error('Error handling request:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal Server Error', details: (err as any).message }));
    }
  }
});

// Configure server timeouts
server.timeout = REQUEST_TIMEOUT;
server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT;
server.headersTimeout = HEADERS_TIMEOUT;

server.listen(PORT, () => {
  console.log(`Development API server running at http://localhost:${PORT}`);
  console.log(`Timeout settings: request=${REQUEST_TIMEOUT/1000}s, keepAlive=${KEEP_ALIVE_TIMEOUT/1000}s`);
});

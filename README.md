# TM-IA: AI Music Video Generator

> Transform audio into visual storytelling with AI-powered image generation, transcription, and video rendering.

## Quick Start

```bash
# Terminal 1: API Server (port 3004)
npm install
npm run dev

# Terminal 2: Frontend (port 5173)  
cd web && npm install && npm run dev
```

Open `http://localhost:5173`

---

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| Audio Upload | Done | Drag & drop, 15MB limit, mp3/wav/flac |
| AI Transcription | Done | OpenAI Whisper with timestamps |
| Hook Detection | Done | AI identifies chorus/hook segments |
| Image Generation | Done | Gemini-powered scene generation |
| **Scene Editor** | **Done** | **Interactive cards with 8 actions** |
| Storyboard Editor | Done | Reorder, duration, regenerate |
| Video Render | Done | FFmpeg with crossfade transitions |
| Credit System | Done | Pay-as-you-go, transparent pricing |
| PIX Payments | Done | Mercado Pago integration (Brazil) |
| Auth | Done | Email/password + JWT + Google OAuth |
| Sidebar Navigation | Done | Collapsible, mobile-responsive |

---

## Architecture

```
Frontend (Vite + React)     API (Vercel Functions)      AI Services
       |                           |                         |
       +---> /api/upload ----------+---> OpenAI (transcribe) |
       +---> /api/demo/analyze ----+---> OpenAI (hook/mood)  |
       +---> /api/assets/generate -+---> Gemini (images)     |
       +---> /api/render/pro ------+---> FFmpeg (video)      |
```

### Directory Structure

```
tm-ia/
├── api/                    # Backend serverless functions
│   ├── _lib/              # Shared modules (auth, credits, ffmpeg)
│   ├── assets/            # Asset CRUD & generation
│   ├── auth/              # Login, register, Google OAuth
│   │   └── google/        # OAuth callback & check
│   ├── credits/           # Balance & packages
│   ├── demo/              # Analysis & preview
│   ├── payments/          # PIX integration
│   ├── render/            # Video rendering
│   └── upload/            # File upload
├── web/                   # React frontend
│   └── src/
│       ├── components/    # UI components
│       │   ├── Sidebar.tsx        # Collapsible navigation
│       │   ├── StepWizard.tsx     # 3-step wizard with SceneCard
│       │   ├── AuthModal.tsx      # Login/register modal
│       │   └── ...
│       ├── hooks/         # Custom hooks (useCredits, etc.)
│       ├── lib/           # API client
│       └── styles/        # CSS theme
├── docs/                  # Documentation
└── .data/                 # Local user storage (dev only)
```

---

## Environment Variables

Create `.env.local` in project root:

```env
# Required - AI Providers
OPENAI_API_KEY=sk-proj-xxx
GEMINI_API_KEY=AIzaSyXxx

# Required - Security
JWT_SECRET=your-32-char-secret-key-here

# Optional - Development
DEV_TOKEN=dev-token
NODE_ENV=development

# Optional - OAuth (Google)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Optional - Payments (Mercado Pago)
MP_ACCESS_TOKEN=TEST-xxx
MP_WEBHOOK_SECRET=xxx
```

---

## User Flow (3-Step Wizard)

```
1. Landing Page → Sign Up/Login (Email or Google OAuth)
       ↓
2. Step 1: Upload & Analysis
   ├── Drag & drop audio (mp3/wav/flac, max 15MB)
   ├── Auto-transcription with timestamps
   ├── Hook detection highlighted
   └── Mood & genre identification
       ↓
3. Step 2: Visual Configuration
   ├── Aspect ratio (9:16 vertical, 16:9 horizontal, 1:1 square)
   ├── Visual style (cinematic, anime, cyberpunk, watercolor, minimal, neon)
   └── Image frequency (Intense/Dynamic/Smooth/Slow)
       ↓
4. Step 3: Scene Editor & Render
   ├── Interactive scene cards with hover actions
   ├── Edit, regenerate, reorder scenes
   ├── Cost summary before render
   └── Download final MP4
```

### Scene Card Actions

| Action | Icon | Description | Cost |
|--------|------|-------------|------|
| Move Left | ← | Reorder scene position | Free |
| Move Right | → | Reorder scene position | Free |
| Expand | 🔍 | View scene in large modal | Free |
| Edit | ✏️ | Edit prompt/description | Free |
| Regenerate | 🔄 | Generate new image | 30 💎 |
| Animate | ✨ | Convert to video (Phase 9) | 50 💎 |
| Favorite | ⭐ | Mark for reuse | Free |
| Delete | 🗑️ | Remove from storyboard | Free |

**Component:** `web/src/components/StepWizard.tsx`

---

## Credit System (Pay-as-you-go)

| Action | Credits | USD |
|--------|---------|-----|
| Transcription | 3/min | $0.03 |
| Analysis/Hook | 1 | $0.01 |
| Generate Image | 30 | $0.30 |
| Animate Image | 50/sec | $0.50 |
| Render Video | 100/min | $1.00 |
| Export 4K | 200 | $2.00 |

**Free Actions:** Upload, reorder, adjust duration, reuse images, re-render (no changes)

### Credit Packages

| Package | Credits | Price | Discount |
|---------|---------|-------|----------|
| Starter | 500 | $5 | - |
| Creator | 2000 | $18 | 10% |
| Pro | 5000 | $40 | 20% |
| Studio | 15000 | $100 | 33% |

---

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Get JWT token
- `GET /api/auth/google` - Start Google OAuth flow
- `GET /api/auth/google/callback` - Google OAuth callback
- `GET /api/auth/google/check` - Check if OAuth is configured

### Demo/Analysis
- `POST /api/upload` - Upload audio file
- `POST /api/demo/analyze` - Transcribe + detect hook

### Assets
- `POST /api/assets/generate` - Generate N images
- `GET /api/assets?projectId=xxx` - Get project
- `PATCH /api/assets` - Update storyboard
- `POST /api/assets/regen` - Regenerate image

### Render
- `POST /api/render/pro` - Start render job
- `GET /api/render/status?jobId=xxx` - Poll progress
- `GET /api/render/download?jobId=xxx` - Download MP4
- `GET /api/render/history` - List renders

### Credits
- `GET /api/credits` - Get balance
- `GET /api/credits/packages` - List packages
- `POST /api/credits/buy` - Purchase credits
- `POST /api/credits/estimate` - Calculate cost

### Payments
- `POST /api/payments/pix` - Create PIX charge
- `GET /api/payments/status?paymentId=xxx` - Check payment
- `POST /api/payments/webhook` - MP webhook
- `GET /api/payments/history` - Payment history

---

## Testing

```powershell
# Run automated tests
.\test-demo.ps1

# With options
.\test-demo.ps1 -SkipDemo -RenderTimeout 120 -Verbose
```

### Manual Testing Flow

```
1. Register or login (email or Google OAuth)
2. Upload audio file (Step 1)
3. Review transcription and hook detection
4. Configure format, style, frequency (Step 2)
5. Generate scenes
6. Test scene actions (Step 3):
   - Hover over cards to see action bar
   - Move scenes (← →)
   - Expand scene (🔍)
   - Edit prompt (✏️)
   - Regenerate (🔄) - costs 30 credits
   - Favorite (⭐)
   - Delete (🗑️)
7. Render video
8. Download or watch inline
```

---

## Tech Stack

- **Frontend:** React 19, Vite 7, TypeScript
- **Backend:** Vercel Serverless Functions
- **AI:** OpenAI (transcription), Google Gemini (images)
- **Video:** FFmpeg (local rendering)
- **Payments:** Mercado Pago PIX
- **Auth:** JWT + pbkdf2 password hashing

---

## Security Notes

- API keys stored only in backend
- JWT authentication required for all endpoints
- Rate limiting on all endpoints
- Demo limited to 1/day per user
- Passwords hashed with PBKDF2 + salt
- Google OAuth with state parameter for CSRF protection

---

## Troubleshooting

### Port 3004 already in use (EADDRINUSE)

```powershell
# Find process using port 3004
netstat -ano | findstr :3004

# Kill the process (replace <PID> with actual PID)
taskkill /PID <PID> /F

# Restart dev server
npm run dev
```

### ERR_CONNECTION_RESET on upload

1. Ensure API server is running on port 3004
2. Check `http://localhost:3004/api/health` responds
3. Restart both API and frontend servers
4. **Check timeout configuration in `dev-server.ts`** - should have 5-minute timeout

### WebSocket connection failed (Vite HMR)

If you see errors like:
```
WebSocket connection to 'ws://localhost:5173/?token=xxx' failed
[vite] failed to connect to websocket
```

**DO NOT MODIFY** the `web/vite.config.ts` HMR configuration. The settings are intentional:

```typescript
hmr: {
  protocol: 'ws',
  host: 'localhost', 
  port: 5173,
  clientPort: 5173,
}
```

The HMR WebSocket must connect directly to Vite (port 5173), not through the API proxy.

### Transcription not appearing after upload

1. Open browser console (F12) and look for `[StepWizard]` logs
2. Check if "Upload complete" shows `projectId` and `filePath`
3. Check if "Analysis complete" shows transcription data
4. If instrumental music, a yellow "Música Instrumental Detectada" box appears
5. Check dev-server console for `demo.analyze.*` log entries

**Debug flow:**
```
[StepWizard] Uploading audio...
[StepWizard] Upload complete: { projectId: "...", filePath: "..." }
[StepWizard] Starting analysis...
[StepWizard] Analysis complete: { transcription: "...", hookText: "..." }
[StepWizard] Created segments: N
[StepWizard] States updated - hookText: "..." segments: N
```

### Google OAuth returns 500 error

The `/api/auth/google/check` endpoint should ALWAYS return 200.
If you get 500:
1. Check that the endpoint uses `withObservability` wrapper
2. Check dev-server console for the actual error
3. OAuth not configured is normal - it returns `{ configured: false }`

### Auth endpoints returning 500 (login/register/check)

If ALL auth endpoints return 500, the most common causes are:
1. The API dev-server is still serving cached route modules
2. The API dev-server was not restarted after code changes

**Fix:** Restart the API server:
```powershell
npm run dev
```

Also ensure auth endpoints use `loadJwtEnv()` (JWT_SECRET only), NOT `loadEnv()`.

---

## Production Considerations

- [ ] Migrate from /tmp to S3 storage
- [ ] Redis/BullMQ for render queue
- [ ] PostgreSQL for user data
- [ ] Real Mercado Pago credentials
- [ ] GPU acceleration (NVENC)
- [ ] Animation API integration (Veo 2 / G Studio)
- [ ] Drag-and-drop scene reordering

---

## License

Private - All rights reserved

# TM-IA Studio

TM-IA é um SaaS para **criar clipes musicais** a partir de um áudio:
- analisa/transcreve a música
- gera cenas (imagens) com IA
- permite edição (reordenar, editar prompt, regenerar)
- renderiza o vídeo final com FFmpeg

Produção: **https://tm-ia.vercel.app**

---

## Status (o que está funcionando hoje)

- Upload de áudio **grande** via **Cloudflare R2 (direto do navegador, presigned URL)** (evita 413 no Vercel).
- Análise do áudio (transcrição + hook/mood/genre) via `/api/demo/analyze`.
- Geração de imagens via Gemini (geração completa: sem preview/placeholders).
- Edição de cenas no Step 3:
  - reordenar
  - editar prompt
  - regenerar imagem
  - favoritar
  - deletar
  - **copiar fileKey** (auditoria)
- Render de vídeo:
  - render **segue a duração do áudio** (video = audio)
  - formato correto por aspectRatio (9:16 / 16:9 / 1:1)
  - upload do render para Vercel Blob
- Animação simples por cena (estilo "VEO 3 - simples"):
  - zoom-in/zoom-out
  - pan left/right/up/down
  - fade-in / fade-out
  - seleção por **dropdown (select)** no modal da cena
  - **debug**: o render salva um resumo das animações no `logTail` (visível via `/api/render/status?renderId=...`)

---

## Arquitetura

- **Frontend:** React + Vite (`/web`)
- **Backend:** Vercel Functions (`/api`)
- **DB:** PostgreSQL (Prisma)
- **Storage:** Cloudflare R2 (áudios e renders)
- **IA:**
  - OpenAI (Whisper e análises no `/api/demo/analyze`)
  - Google Gemini (imagens)
- **Render:** FFmpeg (serverless job via `/api/render/run`)

Fluxo principal:
1. Web faz upload do áudio direto pro **R2** (presign via `/api/blob/upload`).
2. Web chama `/api/demo/analyze` (por `audioUrl` ou multipart fallback) para transcrição e metadados.
3. Web chama `/api/assets/generate` para criar as cenas.
4. Web chama `/api/render/pro` (JSON, sem reupload do áudio) para iniciar render.
5. `/api/render/run` executa o job e atualiza status.

---

## Repositório

### Pastas importantes

- `web/` — app React
  - `web/src/components/StepWizard.tsx` — wizard (upload → roteiro → edição/render)
  - `web/src/components/Sidebar.tsx` — navegação
  - `web/src/lib/assetsApi.ts` — client de API
- `api/` — Vercel functions
  - `api/blob/upload.ts` — token para upload direto ao Blob
  - `api/demo/analyze.ts` — transcrição/análise
  - `api/assets/generate.ts` — storyboard + geração de imagens
  - `api/assets/regen.ts` — regeneração
  - `api/render/pro.ts` — cria job de render (JSON-only)
  - `api/render/run.ts` — executa render
  - `api/_lib/ffmpegWorker.ts` — pipeline FFmpeg (duração = áudio, animação por cena)
- `prisma/schema.prisma` — schema do banco
- `SECURITY.md` — política de segurança

---

## Rodar localmente (dev)

### Pré-requisitos
- Node 22+
- npm

### Comandos

```bash
# instala deps do root + web
npm install
npm --prefix web install

# dev server (API + front com rewrites do vercel.json)
npm run dev
```

Abra: http://localhost:5173

---

## Variáveis de ambiente

Veja `.env.example` / `.env.local`. Em produção, configure no Vercel.

Mínimo típico:

```env
# DB
DATABASE_URL=...
DIRECT_URL=...

# Auth
JWT_SECRET=...

# IA
OPENAI_API_KEY=...
GEMINI_API_KEY=...

# URL pública (ajuda em callbacks e URLs internas)
PUBLIC_BASE_URL=https://tm-ia.vercel.app

# Cloudflare R2 (storage)
R2_ACCOUNT_ID=...
R2_BUCKET=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
# Base pública para servir arquivos (ex: https://pub-<hash>.r2.dev ou seu domínio)
R2_PUBLIC_BASE_URL=...
```

---

## Segurança (anti prompt-injection / lockfiles)

O repo inclui proteções para reduzir risco de "LLM sequestro" e mudanças sorrateiras:

- `.github/CODEOWNERS` (lockfiles/schema/workflows com codeowner)
- `.github/workflows/security-check.yml`
  - bloqueia PR com mudança em lockfile sem label `deps-ok`
  - roda `npm audit` e `npm ci --dry-run` (root + web)
- `SECURITY.md` com regras de revisão

**Importante:** habilitar branch protection no GitHub com "Require review from Code Owners".

---

## Notas de auditoria

- Cada Asset pode ter `fileKey` (ex.: `tmia__<projeto>__YYYYMMDD-HHmmss__s03__a1b2c3d4`) para rastreio.
- O render usa as imagens do projeto (assets/storyboard) e tenta ser resiliente a projetos antigos.

---

## Troubleshooting

### 413 no render
- Se aparecer `POST /api/render/pro 413`, o navegador está com bundle antigo em cache.
  - faça hard refresh (Ctrl+Shift+R) ou abra em aba anônima.

### 429 em /api/assets
- Existe rate limit. Evite polling agressivo.

---

## Licença

Privado / uso interno.

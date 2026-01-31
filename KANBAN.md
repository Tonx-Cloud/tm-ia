# TM-IA — Kanban

> Quadro simples (arquivo no repo) para acompanhar prioridades sem depender de ferramenta externa.
> Atualize movendo cards entre colunas.

## NEXT (prioridade alta)

### [NEXT-01] Endpoint + Dashboard de status do render
**Objetivo:** acompanhar PENDING/RUNNING/COMPLETE/FAILED, % progress e logTail.

- Backend
  - Revisar/confirmar endpoint existente: `GET /api/render/status?renderId=...`
  - Criar endpoint de listagem por projeto: `GET /api/render/status?projectId=...` (ou `/api/render/history?projectId=...`) retornando: status, progress, outputUrl, error, createdAt
- Frontend
  - Criar uma tela/section (ex: Sidebar → Histórico/Renderizações) com listagem + detalhes

Arquivos/refs:
- `api/render/status.ts` (se existir) / `api/render/history.ts`
- `api/_lib/renderPipeline.ts` + `api/_lib/ffmpegWorker.ts`
- `web/src/components/StepWizard.tsx`

---

### [NEXT-02] Refatorar storage (S3/R2 + presigned URLs)
**Objetivo:** desacoplar áudio/renders do Vercel Blob, reduzir custos e ganhar controle.

- Definir provedor: Cloudflare R2 ou AWS S3
- Implementar upload direto do browser via presigned URL
- Atualizar:
  - upload de áudio (hoje: `/api/blob/upload`)
  - upload de render (hoje: `put()` do Vercel Blob)

Arquivos/refs:
- `api/blob/upload.ts`
- `api/upload/index.ts`
- `api/_lib/ffmpegWorker.ts`

---

### [NEXT-03] Ledger de créditos + idempotência ao debitar
**Objetivo:** evitar dupla cobrança e facilitar auditoria/reembolso.

- Adotar uma “chave de idempotência” por ação:
  - ex: `actionId = sha256(userId + projectId + action + renderId/assetId + timestampBucket)`
- Garantir que `spendCredits` não debite 2x o mesmo `actionId`
- Salvar no `CreditEntry` metadados mínimos

Arquivos/refs:
- `api/_lib/credits.ts`
- `prisma/schema.prisma` (tabela `CreditEntry`)

---

## BACKLOG (médio prazo)

### [BACKLOG-01] Presets de estilo + templates intro/outro
- presets (cinematic/anime/gospel/etc.)
- templates de abertura/fechamento

### [BACKLOG-02] Versionamento e reuso de storyboards/projetos
- versões do storyboard
- “duplicar projeto”

### [BACKLOG-03] Export/integração TikTok/Reels
- presets por plataforma
- metadados e recomendações

### [BACKLOG-04] Testes automatizados + lint/formatter
- CI de testes
- padronização (eslint/prettier) e “check” no PR

---

## CHECKLIST de revisão final

- [ ] Validar fluxo completo: upload → transcrição → cenas → edição → render → download
- [ ] Re-testar cenários: 413 (cache antigo) e 429 (rate limit)
- [ ] Medir concorrência de múltiplos renders e ajustar fila/worker

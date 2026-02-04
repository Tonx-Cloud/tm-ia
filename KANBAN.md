# TM-IA — Kanban

> Quadro simples (arquivo no repo) para acompanhar prioridades sem depender de ferramenta externa.
> Atualize movendo cards entre colunas.

## NOW (em andamento)

### [NOW-02] Smoke tests completos (com envs reais)
**Objetivo:** validar o fluxo ponta-a-ponta com serviços externos.

- Rodar `scripts/smoke-test.ps1` com `Token` válido
- Validar: créditos, criação de projeto e fetch de assets
- (Opcional) Rodar render real em ambiente controlado

Arquivos/refs:
- `scripts/smoke-test.ps1`

---
## NEXT (prioridade alta)

## BACKLOG (medio prazo)

### [BACKLOG-01] Dashboard de status do render
- Endpoint de listagem por projeto + UI de historico

### [BACKLOG-02] Ledger de creditos + idempotencia
- Chave de idempotencia por acao

### [BACKLOG-03] Presets de estilo + templates intro/outro

### [BACKLOG-04] Export TikTok/Reels

### [BACKLOG-05] Testes automatizados + lint/formatter

---

## DONE

### [DONE-01] Proteger trigger interno de render (baseUrl/segredo)
### [DONE-02] Robustez do render (timeouts + cleanup)
### [DONE-03] Crossfade e watermark aplicados
### [DONE-04] Corrigir criacao de projeto no analyze
### [DONE-05] Rate limit persistente (DB/Prisma)
### [DONE-06] Lint configurado (eslint + script)
### [DONE-07] Lint sem warnings (imports/vars ajustados)
### [DONE-08] Upgrade @vercel/node para 5.5.28 (audit hardening)

## CHECKLIST de revisao final

- [ ] Validar fluxo completo: upload → transcricao → cenas → edicao → render → download
- [ ] Re-testar cenarios: 413 (cache antigo) e 429 (rate limit)
- [ ] Medir concorrencia de multiplos renders e ajustar fila/worker

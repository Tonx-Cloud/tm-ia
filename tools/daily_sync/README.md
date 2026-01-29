# Daily Sync (local)

Script para rodar no seu PC (Task Scheduler/cron) e sincronizar:

1) **Preços (Cloud Billing Catalog API)**: lista SKUs do Compute Engine (filtrado por família E2/N1 e região) e normaliza preços (USD por `usageUnit`).
2) **Vertex AI (Model Garden)**: lista publisher models e destaca modelos relacionados a **Veo/video generation** (heurística por nome).
3) (Opcional) **Upsert no seu banco** via SQLAlchemy.

## Setup

```bash
cd tools/daily_sync
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
```

Garanta que suas credenciais ADC estejam ok:

```bash
gcloud auth application-default login
# ou use GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json
```

## Rodar e gerar JSON

```bash
python daily_sync.py --project YOUR_GCP_PROJECT --region us-central1 --out-json out.json
```

## Rodar e gravar no DB (exemplo)

```bash
python daily_sync.py --project YOUR_GCP_PROJECT --region us-central1 \
  --db-url postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
```

## Observações

- O módulo de billing usa o **Cloud Billing Catalog** (google-cloud-billing). Ele **não** consulta sua fatura, só o catálogo público de SKUs.
- A disponibilidade do Veo pode variar por região/projeto. O script lista publisher models e marca como video-related se `display_name` ou `name` contiver `veo`/`video`.
- Se você quiser uma checagem mais "forte" de Veo (ex.: tentar uma chamada de geração e capturar erro), dá pra adicionar depois.

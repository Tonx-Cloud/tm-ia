# Infraestrutura TM-IA

Este documento descreve a arquitetura híbrida (Vercel + Worker VM) do projeto TonMovies IA.

## Visão Geral

O sistema é composto por duas partes principais:

1.  **Backend API (Vercel):** Gerencia banco de dados, autenticação, orquestração de jobs e serve o frontend.
2.  **Worker (VM Dedicada):** Executa tarefas pesadas de processamento de áudio/vídeo (Transcrição IA e Renderização FFmpeg).

## 1. Backend API (Vercel)

-   **Stack:** Node.js (Next.js / Serverless Functions)
-   **Banco de Dados:** PostgreSQL (Supabase/Prisma)
-   **Storage:** Cloudflare R2 (Armazenamento de áudios brutos e vídeos renderizados)
-   **Função:**
    -   Recebe uploads de áudio.
    -   Cria registros no banco (`Project`, `Render`).
    -   Delega o processamento pesado para o Worker via HTTP (`POST /transcribe`, `POST /render`).
    -   Fallback: Se o Worker não estiver configurado, tenta usar APIs externas (OpenAI Whisper) ou roda localmente (FFmpeg static - *deprecated para produção*).

## 2. Worker (VM Dedicada - Python)

-   **Stack:** Python 3.10 + FastAPI + Docker
-   **Libs Principais:** `faster-whisper` (Transcrição), `ffmpeg-python` (Renderização)
-   **Localização:** Google Cloud VM (ou outra VM com GPU/CPU potente)
-   **Endpoints:**
    -   `POST /transcribe`: Recebe URL do áudio, baixa, roda Whisper local, retorna JSON com segmentos.
    -   `POST /render`: (Em dev) Recebe storyboard JSON e URLs, baixa assets, roda FFmpeg complexo, faz upload do resultado.

### Instalação do Worker

O código do worker reside na pasta `/worker` do repositório.

1.  **Requisitos:** Docker e Docker Compose instalados na VM.
2.  **Setup:**
    ```bash
    cd worker
    docker compose up -d --build
    ```
3.  **Variáveis de Ambiente (no `docker-compose.yml` ou `.env`):**
    -   `WHISPER_MODEL`: Modelo a usar (`tiny`, `small`, `medium`, `large-v3`).
    -   `USE_GPU`: `true` se a VM tiver NVIDIA GPU (requer drivers + nvidia-docker), `false` para CPU.

## Fluxo de Dados

1.  **Usuário** faz upload de áudio no Front.
2.  **Front** envia para API (Vercel) -> Salva no R2.
3.  **API** chama `WORKER_URL/transcribe` com a URL do áudio.
4.  **Worker** baixa o áudio, transcreve e devolve o texto.
5.  **API** usa o texto para gerar prompts (LLM) e imagens.
6.  **Usuário** edita o storyboard e clica em "Renderizar".
7.  **API** chama `WORKER_URL/render` (futuro) ou processa fila.

## Configuração Vercel (.env)

Para ativar o Worker, adicione estas variáveis no projeto Vercel:

```env
# URL base do worker (ex: IP público ou domínio via Tunnel)
ASR_BASE_URL=http://SEU_IP_DA_VM:8000

# (Opcional) Token para segurança básica
ASR_TOKEN=meu-token-secreto
```

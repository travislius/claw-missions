# 🐙 OctoVault

Self-hosted personal file vault.

## Quick Start

```bash
cp .env.example .env
docker compose up -d --build
```

Open http://localhost:5679

## Dev

Backend:
```bash
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 5679
```

Frontend:
```bash
cd frontend && npm install && npm run dev
```

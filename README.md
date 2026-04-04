<img src="https://raw.githubusercontent.com/travislius/claw-missions/main/docs/logo.png" width="120" alt="Claw Missions Logo" />

# Claw Missions

**Mission control for your digital life.** A self-hosted hub for file storage, AI agent integration, team monitoring, and personal automation — built to be fast, private, and actually good-looking.

> Started as a personal file vault. Evolving into a full AI operations dashboard.

[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](./LICENSE)
[![Built with FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Built with React](https://img.shields.io/badge/Frontend-React-61DAFB?logo=react)](https://react.dev)

---

## 📸 Screenshots

### 🏠 Mission Control — Home Dashboard
![Home](docs/screenshots/home-ocean.jpg)

### 🔐 Login — Ocean Theme
![Login](docs/screenshots/login-ocean.jpg)

### 🌐 Monitor — Uptime & Latency
![Monitor](docs/screenshots/monitor-ocean.jpg)

### 👥 Team — Multi-Machine Overview
![Team](docs/screenshots/team.jpg)

### 📡 Sessions — AI Session History
![Sessions](docs/screenshots/sessions.jpg)

### 🧠 Skills — Agent Skills Browser
![Skills](docs/screenshots/skills.jpg)

---

## What Is Claw Missions?

Claw Missions is a lightweight, self-hosted platform that gives you full ownership of your files, AI agents, and automation pipelines. No subscriptions, no third-party clouds, no bloat.

- 🗄️ **File vault** — Upload, organize, tag, search, and preview your files
- 🤖 **AI agent dashboard** — Track sessions, coding agents, and skills across your fleet
- 📡 **Live feed** — Real-time activity stream from your AI and cron jobs
- 🖥️ **Team monitor** — See all your machines and their status at a glance
- 🌐 **Site monitor** — Uptime and latency tracking for your web services
- 📱 **PWA** — Installs on your phone like a native app
- 🔐 **Private by default** — Your data stays on your machine

Built to work seamlessly with [OpenClaw](https://github.com/openclaw/openclaw) — your personal AI agent hub.

---

## ✨ Features

- 📁 **File browser** — Upload, download, rename, delete, move files
- 🏷️ **Tags** — Label files with searchable, color-coded tags
- 🔍 **Search** — Instant search by filename or tag
- 🖼️ **Preview** — Inline image and PDF preview
- 📱 **PWA** — Install on your phone like a native app
- 🔐 **Auth** — Username/password login with JWT + API key support
- 🤖 **REST API** — Full API for automation and AI agent integration
- 🐳 **Docker** — One-liner deployment with `docker compose up`
- 📊 **Dashboard widgets** — Pinnable cards for system stats, schedule, tasks, projects, and more
- 🏃 **Sessions viewer** — Browse and inspect AI session history with token usage
- 🧠 **Skills browser** — See all installed OpenClaw skills (custom + built-in)
- 🖥️ **Team page** — Multi-machine fleet overview with live status
- 📡 **Site monitor** — Track uptime and HTTP latency for your services
- 🔔 **Live feed** — Real-time activity stream for uploads, sessions, and cron events

---

## 🚀 Quick Start

### Docker (recommended)

```bash
git clone https://github.com/travislius/claw-missions.git
cd claw-missions
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
```

Open `http://localhost:5679` in your browser.

### Native (Python + Node)

```bash
git clone https://github.com/travislius/claw-missions.git
cd claw-missions

# Backend
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt && cd ..

# Frontend
cd frontend && npm install && npm run build && cd ..

# Configure & run
cp .env.example .env   # Edit with your credentials
./start.sh
```

---

## ⚙️ Configuration

Copy `.env.example` to `.env` and edit:

```env
CLAWMISSIONS_USERNAME=admin
CLAWMISSIONS_PASSWORD=changeme          # Use something strong!
CLAWMISSIONS_SECRET=random-string       # openssl rand -hex 32
CLAWMISSIONS_STORAGE=/data/files        # Where files live on disk
CLAWMISSIONS_DB=/data/clawmissions.db
CLAWMISSIONS_MAX_UPLOAD_MB=500
CLAWMISSIONS_PORT=5679
```

> Keep your data directory outside the git repo to avoid committing personal files.

---

## 🖥️ Team & Fleet Setup

To display your machines on the Team page, copy `backend/team.sample.json` to `backend/team.json` and fill in your details:

```json
{
  "tia": {
    "name": "Tia",
    "emoji": "🌿",
    "role": "Always-On Hub",
    "machine": "Mac Mini",
    "specs": "32 GB RAM · 2 TB SSD",
    "os": "macOS",
    "location": "Home",
    "fetch": "local"
  }
}
```

`team.json` is gitignored — your machine details and IPs stay private.

---

## 🌐 Exposing to the Internet

For HTTPS access anywhere, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (free):

```bash
cloudflared tunnel create claw-missions
cloudflared tunnel route dns claw-missions missions.yourdomain.com
```

Or use nginx + Let's Encrypt for a traditional reverse proxy setup.

---

## 📡 REST API

Full REST API — designed for AI agents and automation:

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:5679/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}' | jq -r .access_token)

# Upload a file
curl -X POST http://localhost:5679/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/document.pdf"

# Search files
curl "http://localhost:5679/api/files/search?q=report" \
  -H "Authorization: Bearer $TOKEN"

# Tag a file
curl -X POST http://localhost:5679/api/files/1/tags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[1, 2]'
```

Full interactive docs at `http://localhost:5679/docs` (Swagger UI).

---

## 🏗️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Python + FastAPI |
| Database | SQLite via SQLAlchemy |
| Auth | JWT tokens + bcrypt |
| Storage | Real filesystem (files are actual files) |
| Container | Docker + docker-compose |

---

## 🔐 Security

- Bcrypt password hashing
- JWT with configurable expiry
- CORS lockdown (set `CLAWMISSIONS_ALLOWED_ORIGINS`)
- API key auth for machine-to-machine calls
- `team.json` and `.env` are gitignored — no secrets in the repo

For sensitive deployments, add **Cloudflare Access** as a second auth layer (free tier available).

See [SECURITY.md](./SECURITY.md) for the full guide.

---

## 🗺️ Roadmap

- [ ] Multi-user support with role-based access
- [ ] Folder organization
- [ ] Bulk operations (tag, delete, move)
- [ ] Full-text search inside documents
- [ ] Share links (public file sharing with expiry)
- [ ] OpenClaw deep integration (agent memory store)
- [ ] Mobile app (React Native)

---

## 🤝 Contributing

PRs welcome. Open an issue first for big changes.

---

## 📄 License

MIT — use it, fork it, make it yours.

---

Built by [@travislius](https://github.com/travislius)

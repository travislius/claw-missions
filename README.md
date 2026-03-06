# 🐙 Claw Missions

> A beautiful, lightweight, self-hosted personal file vault.

Claw Missions is a clean alternative to Nextcloud — fast, simple, and actually good-looking. Built for people who want to self-host their personal files without the complexity.

![Claw Missions Screenshot](https://raw.githubusercontent.com/travislius/clawmissions/main/docs/screenshot.png)

## ✨ Features

- 📁 **File browser** — Upload, download, rename, delete, move files
- 🏷️ **Tags** — Label files with searchable, color-coded tags
- 🔍 **Search** — Instant search by filename or tag
- 🖼️ **Preview** — Inline image and PDF preview
- 📱 **PWA** — Install on your phone like a native app
- 🔐 **Auth** — Simple username/password with JWT
- 🤖 **REST API** — Full API for automation and AI integration
- 🐳 **Docker** — One-liner deployment with `docker compose up`

## 🚀 Quick Start

### Docker (recommended)

```bash
git clone https://github.com/travislius/clawmissions.git
cd clawmissions
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
```

Open http://localhost:5679 in your browser.

### Native (Python + Node)

```bash
git clone https://github.com/travislius/clawmissions.git
cd clawmissions

# Backend
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt && cd ..

# Frontend
cd frontend && npm install && npm run build && cd ..

# Configure
cp .env.example .env
# Edit .env with your credentials

# Run
./start.sh
```

## ⚙️ Configuration

Copy `.env.example` to `.env` and edit:

```env
OCTOCLOUD_USERNAME=admin        # Login username
OCTOCLOUD_PASSWORD=changeme     # Login password (use something strong!)
OCTOCLOUD_SECRET=random-string  # JWT secret (generate with: openssl rand -hex 32)
OCTOCLOUD_STORAGE=/data/files   # Where files are stored on disk
OCTOCLOUD_DB=/data/clawmissions.db # SQLite database path
OCTOCLOUD_MAX_UPLOAD_MB=500     # Max upload size in MB
OCTOCLOUD_PORT=5679             # Port to listen on
```

> **Important:** Keep your data directory outside the git repo to avoid accidentally committing personal files.

## 🌐 Exposing to the Internet

For HTTPS access from anywhere (phone, etc.), use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

```bash
cloudflared tunnel create clawmissions
cloudflared tunnel route dns clawmissions vault.yourdomain.com
```

Or use a reverse proxy like nginx with Let's Encrypt.

## 📡 REST API

Claw Missions has a full REST API — useful for automation and AI assistants:

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
curl http://localhost:5679/api/files/search?q=passport \
  -H "Authorization: Bearer $TOKEN"

# Add a tag
curl -X POST http://localhost:5679/api/files/1/tags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[1, 2]'
```

Full API docs available at `http://localhost:5679/docs` (Swagger UI).

## 🏗️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Python + FastAPI |
| Database | SQLite (via SQLAlchemy) |
| Auth | JWT tokens |
| Storage | Real filesystem (files are actual files) |
| Container | Docker + docker-compose |

## 📂 Project Structure

```
clawmissions/
├── backend/
│   └── app/
│       ├── main.py          # FastAPI app
│       ├── routers/         # API routes (auth, files, tags)
│       ├── models.py        # Database models
│       ├── schemas.py       # Pydantic schemas
│       └── utils/           # Storage, thumbnails
├── frontend/
│   └── src/
│       ├── pages/           # Browse, Login, Search
│       ├── components/      # FileGrid, Preview, Sidebar
│       └── api.js           # API client
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── start.sh                 # Native startup script
```

## 🔐 Security

Claw Missions includes rate limiting, bcrypt password hashing, CORS lockdown, and strong JWT signing. For deployments storing sensitive files, we recommend adding **Cloudflare Access** (free) as a second authentication layer.

See [SECURITY.md](./SECURITY.md) for the full guide.

## 🤝 Contributing

PRs welcome! Ideas for future features:

- [ ] Multi-user support
- [ ] Folder organization
- [ ] Bulk operations (bulk tag, bulk delete)
- [ ] Full-text search inside documents
- [ ] Share links (public file sharing)
- [ ] Duplicate detection
- [ ] Mobile app (React Native)

## 📄 License

MIT — use it, fork it, make it yours.

---

Built with ❤️ by [@travislius](https://github.com/travislius)

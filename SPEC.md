# Claw Missions — Technical Specification

> Last updated: 2026-04-03

## Overview

Claw Missions is a self-hosted AI operations dashboard. Originally a personal file vault, it has evolved into a full mission-control UI for managing files, tasks, AI agent sessions, skills, team machines, and site monitoring — all from a single clean interface.

**Design philosophy:** Fast, lightweight, private. Runs on a Mac Mini behind a Cloudflare tunnel. No third-party dependencies at runtime.

---

## Architecture

```
claw-missions/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + static file serving
│   │   ├── config.py        # Settings from env vars
│   │   ├── database.py      # SQLite + SQLAlchemy setup
│   │   ├── models.py        # DB models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── auth.py          # JWT + API key auth
│   │   └── routers/
│   │       ├── auth.py      # Login, token refresh
│   │       ├── files.py     # Upload, download, browse, delete
│   │       ├── tags.py      # Tag CRUD + assign to files
│   │       ├── tasks.py     # Task CRUD + filtering
│   │       ├── search.py    # Search files
│   │       ├── sessions.py  # OpenClaw session proxy
│   │       ├── skills.py    # OpenClaw skills proxy
│   │       ├── team.py      # Machine status (team.json)
│   │       └── monitor.py   # HTTP uptime checks
│   ├── requirements.txt
│   └── team.sample.json     # Team config template (gitignored: team.json)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Routes + auth context
│   │   ├── main.jsx
│   │   ├── api.js           # API client (axios)
│   │   ├── pages/
│   │   │   ├── Home.jsx     # Dashboard with pinned widgets + live feed
│   │   │   ├── Login.jsx    # Auth page (clean white, no decorations)
│   │   │   ├── Tasks.jsx    # Kanban board + sortable list view
│   │   │   ├── Memory.jsx   # AI memory file browser
│   │   │   ├── Projects.jsx # Project tracker
│   │   │   ├── Notes.jsx    # Note categories + replies
│   │   │   ├── Schedule.jsx # Cron job calendar
│   │   │   ├── Monitor.jsx  # HTTP uptime + latency
│   │   │   ├── Team.jsx     # Multi-machine fleet view
│   │   │   ├── Sessions.jsx # AI session history browser
│   │   │   ├── Agents.jsx   # Agent registry
│   │   │   ├── Documents.jsx# File vault
│   │   │   └── Skills.jsx   # Installed skills browser
│   │   └── components/
│   │       ├── Header.jsx   # Top bar (ocean watercolor bg, search, logout)
│   │       ├── Sidebar.jsx  # Navigation (12 sections, teal active state)
│   │       ├── FileGrid.jsx
│   │       ├── FileList.jsx
│   │       ├── TagBar.jsx
│   │       └── Preview.jsx
│   ├── public/
│   │   ├── manifest.json
│   │   ├── sw.js
│   │   └── icons/
│   │       └── sea/         # AI-generated kawaii sea creature PNGs
│   ├── index.html           # Forces light mode (no dark class)
│   ├── vite.config.js
│   ├── tailwind.config.js   # Custom ocean palette (sand/coral/seafoam/sky/ocean)
│   └── package.json
├── docs/
│   ├── logo.png             # App icon (AI-generated teal robotic claw + compass)
│   └── screenshots/         # Latest UI screenshots
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .env                     # gitignored
├── README.md
└── SPEC.md
```

---

## Design System

### Colors (Tailwind custom palette)

| Name | Range | Usage |
|------|-------|-------|
| `ocean` | 50–950 | Primary accent — teal. Active states, buttons, borders, progress bars |
| `sand` | 50–300 | Warm background tones, card fills |
| `coral` | 50–300 | Warning states, priority highlights |
| `seafoam` | 50–300 | Secondary badges, tag pills |
| `sky` | 50–300 | Info states, light header accents |

**Key shades:**
- `ocean-500`: `#319795` — primary action color
- `ocean-600`: `#2c7a7b` — hover/active states
- `ocean-700`: `#285e61` — dark text on light bg

### Layout

- **Sidebar**: 200px fixed, teal active `border-l-4`, 12 navigation items
- **Header**: 63px tall, ocean watercolor background image, search bar, logout
- **Main**: white canvas `bg-white`, responsive content area
- **Font**: System sans-serif stack

### Theme

- **Light mode only** — dark mode disabled (forced via `index.html` class)
- White body background; gradient only on login and header bar
- Ocean/teal accent throughout

---

## Data Models

```python
class User:
    id: int
    username: str
    password_hash: str      # bcrypt
    api_key: str            # For machine-to-machine access
    created_at: datetime

class File:
    id: int
    name: str               # Original filename
    path: str               # Relative storage path
    size: int               # Bytes
    mime_type: str
    checksum: str           # SHA-256
    thumbnail_path: str     # Nullable
    created_at: datetime
    updated_at: datetime

class Tag:
    id: int
    name: str
    color: str              # Hex color code
    created_at: datetime

class FileTag:              # Many-to-many join
    file_id: int
    tag_id: int

class Task:
    id: int
    title: str
    description: str        # Nullable
    status: str             # backlog | todo | in-progress | done | blocked
    priority: str           # low | medium | high | urgent
    tags: list[str]         # Stored as JSON array of tag strings
    created_by: str         # Agent/user name
    due_date: datetime      # Nullable
    created_at: datetime
    updated_at: datetime
    position: int           # For drag-and-drop ordering

class Note:
    id: int
    category: str
    content: str
    reply_to: int           # Nullable (thread replies)
    created_at: datetime
```

---

## API Endpoints

### Auth
```
POST   /api/auth/login              → { access_token, token_type }
POST   /api/auth/refresh            → { access_token }
```

### Files
```
GET    /api/files                   → paginated list (sort, filter by tag)
POST   /api/files/upload            → upload file (multipart)
GET    /api/files/{id}              → file metadata
GET    /api/files/{id}/download     → stream file (JWT or token param)
GET    /api/files/{id}/thumb        → thumbnail PNG
DELETE /api/files/{id}              → delete
PUT    /api/files/{id}              → update metadata
GET    /api/files/search?q=         → search by name/tag
```

### Tags
```
GET    /api/tags                    → list all
POST   /api/tags                    → create
PUT    /api/tags/{id}               → update
DELETE /api/tags/{id}               → delete
POST   /api/files/{id}/tags         → assign tags [tag_id, ...]
DELETE /api/files/{id}/tags/{tid}   → remove tag
```

### Tasks
```
GET    /api/tasks                   → list (filter: status, assignee, priority, tags)
POST   /api/tasks                   → create task
PUT    /api/tasks/{id}              → update task
DELETE /api/tasks/{id}              → delete task
PUT    /api/tasks/{id}/position     → reorder (drag-and-drop)
```

### System
```
GET    /api/stats                   → storage + task stats
GET    /api/team                    → machine status from team.json
GET    /api/monitor                 → HTTP uptime checks
GET    /api/sessions                → OpenClaw session proxy
GET    /api/skills                  → OpenClaw skills proxy
GET    /api/livefeed                → recent activity stream
```

---

## Auth

- **Login flow**: `POST /api/auth/login` → JWT (24h expiry)
- **Browser requests**: `Authorization: Bearer <token>` header
- **API/agent requests**: `X-API-Key: <api_key>` header
- **Config**: credentials set via `.env` — no database admin setup needed

---

## Tasks Page

Two view modes toggled via header buttons:

### Board View (default)
- Kanban columns: Backlog, Todo, In Progress, Done, Blocked
- Drag-and-drop cards between columns
- Cards show: title, description excerpt, tags, assignee, created date
- "Add task" quick-entry at bottom of each column

### List View
- 8-column sortable table: Title, Status, Priority, Tags, By, Due, Age
- Click column header to sort; click again to reverse
- Custom sort order:
  - Status: `blocked → in-progress → todo → backlog → done`
  - Priority: `urgent → high → medium → low`
- Expandable rows (chevron) show full description + notes
- Quick-add bar at top: type title + Enter to create task

**Shared filters:** Status tabs, By (assignee), Priority — apply to both views.

---

## Configuration

```env
CLAWMISSIONS_USERNAME=admin
CLAWMISSIONS_PASSWORD=changeme
CLAWMISSIONS_SECRET=<openssl rand -hex 32>
CLAWMISSIONS_STORAGE=/path/to/files
CLAWMISSIONS_DB=/path/to/clawmissions.db
CLAWMISSIONS_MAX_UPLOAD_MB=500
CLAWMISSIONS_PORT=5679
CLAWMISSIONS_ALLOWED_ORIGINS=https://your.domain.com
```

---

## Team Page

Machine metadata loaded from `backend/team.json` (gitignored; copy from `team.sample.json`):

```json
{
  "tia": {
    "name": "Tia Li",
    "emoji": "🌿",
    "role": "Always-On Hub",
    "machine": "Mac Mini M4",
    "specs": "32 GB RAM · 2 TB SSD",
    "os": "macOS",
    "location": "Home",
    "fetch": "local"
  },
  "max": {
    "name": "Max",
    "emoji": "🔬",
    "role": "Heavy Compute + GPU",
    "machine": "Linux Server",
    "specs": "128 GB RAM · RTX 4080 · 8 TB SSD",
    "os": "Ubuntu 24.04",
    "location": "Home",
    "fetch": "ssh"
  }
}
```

Fields: `name`, `emoji`, `role`, `machine`, `specs`, `os`, `location`, `fetch` (`local` | `ssh` | `api`)

---

## Monitor Page

Configured sites polled via HTTP GET. Status shown with latency color coding:
- Green: `< 200ms`
- Orange: `200–500ms`
- Red: `> 500ms` or non-200 response

Auto-refreshes every 30 seconds.

---

## Docker

```yaml
services:
  clawmissions:
    build: .
    ports:
      - "5679:5679"
    volumes:
      - ./data:/data
    env_file:
      - .env
    restart: unless-stopped
```

Single Dockerfile: Python backend serves built React frontend as static files from `frontend/dist/`.

---

## Deployment (Mac Mini)

```
Mac Mini :5679 (uvicorn)
  → cloudflared tunnel
    → missions.octodance.com (Cloudflare)
      → Cloudflare Access (zero-trust auth layer)
```

Data directory: `~/clawmissions-data/` (files + SQLite DB, outside git repo)

LaunchAgent manages auto-start on boot via `launchd-start.sh`.

---

## Frontend Build

```bash
cd frontend
npm install
npm run build    # outputs to frontend/dist/
```

Vite bundles React + Tailwind. FastAPI serves `frontend/dist/` as static files and returns `index.html` for all non-API routes (SPA routing).

---

## Roadmap

- [ ] Multi-user support with RBAC
- [ ] Folder organization for files
- [ ] Bulk operations (tag/delete/move)
- [ ] Full-text search inside documents
- [ ] Public share links with expiry
- [ ] Calendar day/week view in Schedule
- [ ] PWA offline mode for tasks
- [ ] Mobile-optimized task entry

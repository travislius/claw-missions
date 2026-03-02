# OctoVault — Self-hosted Personal File Vault

## Overview
Lightweight, beautiful, self-hosted file vault for people who want simplicity over Nextcloud bloat.

## Architecture
```
octovault/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app
│   │   ├── config.py        # Settings (env vars)
│   │   ├── database.py      # SQLite + SQLAlchemy
│   │   ├── models.py        # DB models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── auth.py          # JWT + API key auth
│   │   ├── routers/
│   │   │   ├── auth.py      # Login, token refresh
│   │   │   ├── files.py     # Upload, download, browse, delete
│   │   │   ├── tags.py      # CRUD tags, assign to files
│   │   │   └── search.py    # Full-text search
│   │   └── utils/
│   │       ├── thumbnails.py # Image/PDF thumb generation
│   │       └── storage.py   # File system operations
│   ├── requirements.txt
│   └── alembic/ (optional, v2)
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── api.js           # API client
│   │   ├── store.js         # Zustand state
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Browse.jsx
│   │   │   ├── Upload.jsx
│   │   │   └── Search.jsx
│   │   └── components/
│   │       ├── FileGrid.jsx
│   │       ├── FileList.jsx
│   │       ├── TagBar.jsx
│   │       ├── Preview.jsx
│   │       ├── Sidebar.jsx
│   │       └── Header.jsx
│   ├── public/
│   │   ├── manifest.json
│   │   └── sw.js
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```

## Backend Details

### Models
```python
# User (single user v1)
class User:
    id: int
    username: str
    password_hash: str
    api_key: str  # For agent/API access
    created_at: datetime

# File
class File:
    id: int
    name: str           # Original filename
    path: str           # Relative storage path
    size: int           # Bytes
    mime_type: str
    checksum: str       # SHA-256 for dedup
    thumbnail_path: str # Nullable
    created_at: datetime
    updated_at: datetime

# Tag
class Tag:
    id: int
    name: str
    color: str          # Hex color
    created_at: datetime

# FileTag (many-to-many)
class FileTag:
    file_id: int
    tag_id: int
```

### API Endpoints
```
POST   /api/auth/login          # Get JWT token
POST   /api/auth/refresh        # Refresh token
GET    /api/files                # List files (pagination, sort, filter by tag)
POST   /api/files/upload        # Upload file(s) — multipart
GET    /api/files/{id}          # File metadata
GET    /api/files/{id}/download # Download file
GET    /api/files/{id}/thumb    # Get thumbnail
DELETE /api/files/{id}          # Delete file
PUT    /api/files/{id}          # Update metadata
GET    /api/files/search?q=     # Search by name/tag
GET    /api/tags                # List all tags
POST   /api/tags                # Create tag
PUT    /api/tags/{id}           # Update tag
DELETE /api/tags/{id}           # Delete tag
POST   /api/files/{id}/tags     # Assign tags to file
DELETE /api/files/{id}/tags/{tag_id}  # Remove tag
GET    /api/stats               # Storage stats
```

### Auth
- **Login**: username + password → JWT (24h expiry)
- **API Key**: Header `X-API-Key` for programmatic access
- **First run**: Create admin user via env vars or CLI

### Config (.env)
```
OCTOVAULT_USERNAME=admin
OCTOVAULT_PASSWORD=changeme
OCTOVAULT_SECRET=random-jwt-secret
OCTOVAULT_STORAGE=/data/files
OCTOVAULT_DB=/data/octovault.db
OCTOVAULT_MAX_UPLOAD_MB=500
OCTOVAULT_PORT=5679
```

### Thumbnails
- Images: Pillow resize to 200x200
- PDFs: pdf2image first page → thumbnail
- Others: mime-type icon placeholder

## Frontend Details

### Design
- Clean, modern, dark mode default with light toggle
- Card grid view (like Google Drive) + list view toggle
- Drag & drop upload zone
- Tag chips with colors
- Image/PDF inline preview modal
- Responsive — works on phone browsers

### PWA
- manifest.json with icons
- Service worker for offline file list cache
- Add to home screen support

## Docker
```yaml
# docker-compose.yml
services:
  octovault:
    build: .
    ports:
      - "5679:5679"
    volumes:
      - ./data:/data
    env_file:
      - .env
    restart: unless-stopped
```

Single Dockerfile: Python backend serves built React frontend as static files.

## Deployment on Mac Mini
- Port 5679
- Cloudflare tunnel → photo.octodance.com
- Data in ~/octovault-data/ (persistent)

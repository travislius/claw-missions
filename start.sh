#!/bin/bash
# Claw Missions startup script (native, no Docker)
# Copy .env.example to .env and fill in your values before running

cd "$(dirname "$0")"

# Load .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Set defaults if not provided
export CLAWMISSIONS_USERNAME=${CLAWMISSIONS_USERNAME:-admin}
export CLAWMISSIONS_PASSWORD=${CLAWMISSIONS_PASSWORD:-changeme}
export CLAWMISSIONS_SECRET=${CLAWMISSIONS_SECRET:-$(openssl rand -hex 32)}
export CLAWMISSIONS_STORAGE=${CLAWMISSIONS_STORAGE:-$(pwd)/data/files}
export CLAWMISSIONS_DB=${CLAWMISSIONS_DB:-$(pwd)/data/clawmissions.db}
export CLAWMISSIONS_MAX_UPLOAD_MB=${CLAWMISSIONS_MAX_UPLOAD_MB:-500}
export CLAWMISSIONS_PORT=${CLAWMISSIONS_PORT:-5679}

mkdir -p "$CLAWMISSIONS_STORAGE"

exec backend/venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port "$CLAWMISSIONS_PORT"

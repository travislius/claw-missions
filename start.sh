#!/bin/bash
# OctoVault startup script (native, no Docker)
cd "$(dirname "$0")"
source backend/venv/bin/activate
export OCTOVAULT_USERNAME=travis
export OCTOVAULT_PASSWORD='OctoVault2026!'
export OCTOVAULT_SECRET=octovault-jwt-secret-2026
export OCTOVAULT_STORAGE="$(pwd)/data/files"
export OCTOVAULT_DB="$(pwd)/data/octovault.db"
export OCTOVAULT_MAX_UPLOAD_MB=500
export OCTOVAULT_PORT=5679
mkdir -p data/files
exec uvicorn backend.app.main:app --host 0.0.0.0 --port 5679

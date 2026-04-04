#!/bin/bash
# LaunchAgent wrapper for Claw Missions
# Copy this to your LaunchAgent plist and update the WorkingDirectory
# Env vars are set by the plist, no .env sourcing needed
cd "$(dirname "$0")"
exec backend/venv/bin/uvicorn backend.app.main:app --host 0.0.0.0 --port 5679

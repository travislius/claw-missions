import json
import re
import subprocess
import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from ..auth import get_current_user

# ── Team config (loaded from team.json, gitignored) ───────────────────────────
import os as _os

def _load_team() -> dict:
    _here = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    _path = _os.path.join(_here, "team.json")
    if _os.path.exists(_path):
        with open(_path) as f:
            return json.load(f)
    # Minimal fallback — no private data
    return {
        "tia": {"name": "Tia", "emoji": "🌿", "role": "Hub", "machine": "Mac Mini",
                "specs": "", "os": "macOS", "location": "", "fetch": "local"}
    }

TEAM = _load_team()

router = APIRouter()

# ── category mapping ────────────────────────────────────────────────────────

def _categorize(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ['trade', 'trading', 'market', 'tqqq', 'sqqq', 'stock', 'investment', 'pre-market', 'after-hours', 'power hour', 'trade-bot']):
        return 'trading'
    if any(k in n for k in ['youtube', 'shorts', 'wok', 'oddly', 'city vibes', 'roboplex', 'lol factory']):
        return 'youtube'
    if any(k in n for k in ['email', 'gmail', 'outlook', 'inbox']):
        return 'email'
    if any(k in n for k in ['blog', 'article', 'content', 'money ideas', 'geopolitical', 'intelligence', 'brief', 'research']):
        return 'content'
    if any(k in n for k in ['sparknexus', 'snx', 'word monster', 'wordspark', 'word spark', 'monster math', 'lazy ai', 'lazyai']):
        return 'projects'
    return 'system'


# ── cron expression parsing ──────────────────────────────────────────────────

_CRON_TO_CAL = {0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}  # cron→Mon-based

def _parse_dow(expr: str) -> list[int]:
    """Return sorted list of calendar-day indices (0=Mon … 6=Sun)."""
    if expr == '*':
        return list(range(7))
    days: set[int] = set()
    for part in expr.split(','):
        if '-' in part:
            a, b = map(int, part.split('-'))
            for d in range(a, b + 1):
                days.add(_CRON_TO_CAL.get(d % 7, d % 7))
        else:
            d = int(part)
            days.add(_CRON_TO_CAL.get(d % 7, d % 7))
    return sorted(days)


def _parse_expr(expr: str) -> dict:
    """Parse '0 9 * * 1-5' → {minute, hour, days}."""
    parts = expr.strip().split()
    if len(parts) < 5:
        return {"minute": 0, "hour": 0, "days": list(range(7))}
    minute = int(parts[0]) if parts[0] != '*' else 0
    hour   = int(parts[1]) if parts[1] != '*' else 0
    # dom = parts[2] (ignored for weekly view)
    # month = parts[3] (ignored)
    dow    = parts[4]
    return {"minute": minute, "hour": hour, "days": _parse_dow(dow)}


# ── helpers ──────────────────────────────────────────────────────────────────

def _ms_to_relative(ms: int | None) -> str | None:
    if not ms:
        return None
    delta = int(time.time() * 1000) - ms
    if delta < 0:
        secs = abs(delta) // 1000
        if secs < 60: return f"in {secs}s"
        mins = secs // 60
        if mins < 60: return f"in {mins}m"
        hrs = mins // 60
        if hrs < 24: return f"in {hrs}h"
        return f"in {hrs // 24}d"
    secs = delta // 1000
    if secs < 60: return f"{secs}s ago"
    mins = secs // 60
    if mins < 60: return f"{mins}m ago"
    hrs = mins // 60
    if hrs < 24: return f"{hrs}h ago"
    return f"{hrs // 24}d ago"


def _fetch_openclaw_crons_node(node_name: str, openclaw_cmd: str = "openclaw") -> list[dict] | None:
    """Fetch crons from a paired OpenClaw node via `openclaw nodes invoke`."""
    # Use system.run to execute openclaw cron list on the remote node
    params = json.dumps({"cmd": f"{openclaw_cmd} cron list --json"})
    try:
        result = subprocess.run(
            ["openclaw", "nodes", "invoke",
             "--node", node_name,
             "--command", "system.run",
             "--params", params,
             "--json",
             "--invoke-timeout", "15000"],
            capture_output=True, text=True, timeout=20
        )
        if result.returncode != 0:
            return None
        outer = json.loads(result.stdout)
        # The node returns stdout inside the result
        stdout = outer.get("stdout") or outer.get("output") or outer.get("result", "")
        if isinstance(stdout, dict):
            return stdout.get("jobs")
        # Parse JSON from stdout string
        lines = str(stdout).strip().splitlines()
        json_str = next((l for l in lines if l.strip().startswith('{')), None)
        if not json_str:
            json_str = "\n".join(l for l in lines if not l.startswith("**"))
        data = json.loads(json_str)
        return data.get("jobs")
    except Exception:
        return None


def _fetch_openclaw_crons_ssh(host: str, ssh_user: str, cmd: str = "openclaw") -> list[dict]:
    """Fetch crons from a remote machine via SSH."""
    ssh_cmd = [
        "ssh", "-o", "ConnectTimeout=5", "-o", "StrictHostKeyChecking=no",
        "-o", "BatchMode=yes",   # fail fast, no password prompts
        f"{ssh_user}@{host}",
        f"{cmd} cron list --json"
    ]
    try:
        result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return []
        # Find JSON in stdout (strip any warnings)
        lines = result.stdout.strip().splitlines()
        json_str = next((l for l in lines if l.strip().startswith('{')), None)
        if not json_str:
            # Try joining all lines
            json_str = "\n".join(l for l in lines if not l.startswith("**"))
        data = json.loads(json_str)
        return data.get("jobs", [])
    except Exception:
        return []


def _fetch_openclaw_crons() -> list[dict]:
    try:
        result = subprocess.run(
            ["openclaw", "cron", "list", "--json"],
            capture_output=True, text=True, timeout=15
        )
        data = json.loads(result.stdout)
        jobs = data.get("jobs", [])
    except Exception:
        return []

    out = []
    for job in jobs:
        if not job.get("enabled", True):
            continue
        schedule = job.get("schedule", {})
        expr = schedule.get("expr", "0 0 * * *")
        tz   = schedule.get("tz", "America/Los_Angeles")
        parsed = _parse_expr(expr)

        state = job.get("state", {})
        payload = job.get("payload", {})
        message = payload.get("message", "")
        # Truncate task description to ~300 chars for modal
        task_preview = message[:300].strip() + ("…" if len(message) > 300 else "")

        out.append({
            "id":        job["id"],
            "name":      job["name"],
            "source":    "openclaw",
            "kind":      schedule.get("kind", "cron"),
            "category":  _categorize(job["name"]),
            "hour":      parsed["hour"],
            "minute":    parsed["minute"],
            "days":      parsed["days"],
            "expr":      expr,
            "tz":        tz,
            "enabled":   job.get("enabled", True),
            "agent_id":  job.get("agentId"),
            "wake_mode": job.get("wakeMode", "now"),
            "session_target": job.get("sessionTarget", "isolated"),
            "status":    state.get("lastStatus", "unknown"),
            "next_run":  _ms_to_relative(state.get("nextRunAtMs")),
            "last_run":  _ms_to_relative(state.get("lastRunAtMs")),
            "duration_ms": state.get("lastDurationMs"),
            "consecutive_errors": state.get("consecutiveErrors", 0),
            "last_error": state.get("lastError"),
            "target":    job.get("sessionTarget", "isolated"),
            "task_preview": task_preview,
            "timeout_s": payload.get("timeoutSeconds"),
        })
    return out


def _fetch_system_crons() -> list[dict]:
    try:
        result = subprocess.run(["crontab", "-l"], capture_output=True, text=True, timeout=5)
        lines = result.stdout.strip().splitlines()
    except Exception:
        return []

    out = []
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        parts = line.split(None, 5)
        if len(parts) < 6:
            continue
        expr = " ".join(parts[:5])
        cmd  = parts[5]
        parsed = _parse_expr(expr)
        name = re.search(r'[\w-]+\.sh', cmd)
        name = name.group(0) if name else cmd[:40]
        out.append({
            "id":        f"crontab-{hash(line) & 0xFFFFFF:06x}",
            "name":      name,
            "source":    "crontab",
            "category":  _categorize(cmd),
            "hour":      parsed["hour"],
            "minute":    parsed["minute"],
            "days":      parsed["days"],
            "expr":      expr,
            "tz":        "system",
            "status":    "unknown",
            "next_run":  None,
            "last_run":  None,
            "duration_ms": None,
            "consecutive_errors": 0,
            "last_error": None,
            "target":    "shell",
            "task_preview": cmd,
            "timeout_s": None,
        })
    return out


# ── route ────────────────────────────────────────────────────────────────────

@router.get("/team", tags=["crons"])
def get_team(current_user=Depends(get_current_user)):
    """Return team members with their online status."""
    members = []
    for agent_id, cfg in TEAM.items():
        online = False
        if cfg["fetch"] == "local":
            online = True
        elif cfg.get("node_name"):
            # Check via OpenClaw node ping
            try:
                r = subprocess.run(
                    ["openclaw", "nodes", "invoke",
                     "--node", cfg["node_name"],
                     "--command", "system.run",
                     "--params", '{"cmd":"echo ok"}',
                     "--invoke-timeout", "5000"],
                    capture_output=True, timeout=8
                )
                online = r.returncode == 0
            except Exception:
                online = False
        elif cfg.get("host"):
            # SSH fallback ping
            try:
                r = subprocess.run(
                    ["ssh", "-o", "ConnectTimeout=3", "-o", "BatchMode=yes",
                     "-o", "StrictHostKeyChecking=no",
                     f"{cfg['ssh_user']}@{cfg['host']}", "echo ok"],
                    capture_output=True, timeout=5
                )
                online = r.returncode == 0
            except Exception:
                online = False

        members.append({
            "id":       agent_id,
            "name":     cfg["name"],
            "emoji":    cfg["emoji"],
            "role":     cfg["role"],
            "machine":  cfg["machine"],
            "specs":    cfg["specs"],
            "os":       cfg["os"],
            "location": cfg["location"],
            "online":   online,
            "fetch":    cfg["fetch"],
            "has_host": bool(cfg.get("host")),
        })
    return {"members": members}


@router.get("/jobs", tags=["crons"])
def get_cron_jobs(
    agent: str = Query("tia", description="Agent ID: tia | dexter | sia"),
    current_user=Depends(get_current_user)
):
    cfg = TEAM.get(agent, TEAM["tia"])

    if cfg["fetch"] == "local":
        jobs = _fetch_openclaw_crons() + _fetch_system_crons()
    elif cfg.get("node_name"):
        # Primary: OpenClaw node (no SSH auth needed)
        raw = _fetch_openclaw_crons_node(cfg["node_name"], cfg.get("openclaw_cmd", "openclaw"))
        if raw is None and cfg.get("host"):
            # Fallback: SSH
            raw = _fetch_openclaw_crons_ssh(cfg["host"], cfg["ssh_user"], cfg.get("openclaw_cmd", "openclaw"))
        if not raw:
            return {"jobs": [], "total": 0, "by_category": {}, "by_status": {},
                    "agent": agent, "online": False, "error": "Node offline — run OpenClawNode.lnk on Dexter to connect"}
        jobs = []
        for job in raw:
            if not job.get("enabled", True):
                continue
            schedule = job.get("schedule", {})
            expr = schedule.get("expr", "0 0 * * *")
            tz   = schedule.get("tz", "America/Los_Angeles")
            parsed = _parse_expr(expr)
            state = job.get("state", {})
            payload = job.get("payload", {})
            message = payload.get("message", "")
            task_preview = message[:300].strip() + ("…" if len(message) > 300 else "")
            jobs.append({
                "id": job["id"], "name": job["name"], "source": "openclaw",
                "kind": schedule.get("kind", "cron"), "category": _categorize(job["name"]),
                "hour": parsed["hour"], "minute": parsed["minute"], "days": parsed["days"],
                "expr": expr, "tz": tz, "enabled": job.get("enabled", True),
                "agent_id": job.get("agentId"), "wake_mode": job.get("wakeMode", "now"),
                "session_target": job.get("sessionTarget", "isolated"),
                "status": state.get("lastStatus", "unknown"),
                "next_run": _ms_to_relative(state.get("nextRunAtMs")),
                "last_run": _ms_to_relative(state.get("lastRunAtMs")),
                "duration_ms": state.get("lastDurationMs"),
                "consecutive_errors": state.get("consecutiveErrors", 0),
                "last_error": state.get("lastError"),
                "target": job.get("sessionTarget", "isolated"),
                "task_preview": task_preview, "timeout_s": payload.get("timeoutSeconds"),
            })
    elif cfg.get("host"):
        raw = _fetch_openclaw_crons_ssh(cfg["host"], cfg["ssh_user"], cfg.get("openclaw_cmd", "openclaw"))
        if not raw:
            return {"jobs": [], "total": 0, "by_category": {}, "by_status": {},
                    "agent": agent, "online": False, "error": "Could not connect via SSH"}
        # Parse the raw jobs same way as local
        jobs = []
        for job in raw:
            if not job.get("enabled", True):
                continue
            schedule = job.get("schedule", {})
            expr = schedule.get("expr", "0 0 * * *")
            tz   = schedule.get("tz", "America/Los_Angeles")
            parsed = _parse_expr(expr)
            state = job.get("state", {})
            payload = job.get("payload", {})
            message = payload.get("message", "")
            task_preview = message[:300].strip() + ("…" if len(message) > 300 else "")
            jobs.append({
                "id": job["id"], "name": job["name"], "source": "openclaw",
                "kind": schedule.get("kind", "cron"), "category": _categorize(job["name"]),
                "hour": parsed["hour"], "minute": parsed["minute"], "days": parsed["days"],
                "expr": expr, "tz": tz, "enabled": job.get("enabled", True),
                "agent_id": job.get("agentId"), "wake_mode": job.get("wakeMode", "now"),
                "session_target": job.get("sessionTarget", "isolated"),
                "status": state.get("lastStatus", "unknown"),
                "next_run": _ms_to_relative(state.get("nextRunAtMs")),
                "last_run": _ms_to_relative(state.get("lastRunAtMs")),
                "duration_ms": state.get("lastDurationMs"),
                "consecutive_errors": state.get("consecutiveErrors", 0),
                "last_error": state.get("lastError"),
                "target": job.get("sessionTarget", "isolated"),
                "task_preview": task_preview, "timeout_s": payload.get("timeoutSeconds"),
            })
    else:
        return {"jobs": [], "total": 0, "by_category": {}, "by_status": {},
                "agent": agent, "online": False, "error": "No connection configured for this agent"}
    # Sort by hour then minute
    jobs.sort(key=lambda j: (j["hour"], j["minute"]))

    # Summary stats
    by_category = {}
    by_status = {"ok": 0, "error": 0, "unknown": 0}
    for j in jobs:
        by_category[j["category"]] = by_category.get(j["category"], 0) + 1
        st = j["status"] if j["status"] in by_status else "unknown"
        by_status[st] += 1

    return {
        "jobs": jobs,
        "total": len(jobs),
        "by_category": by_category,
        "by_status": by_status,
        "agent": agent,
        "online": True,
    }


# ── Edit endpoint ─────────────────────────────────────────────────────────────

class EditCronRequest(BaseModel):
    name:           Optional[str] = None
    cron:           Optional[str] = None   # raw cron expression e.g. "0 3 * * *"
    tz:             Optional[str] = None   # IANA timezone
    session:        Optional[str] = None   # main | isolated
    wake:           Optional[str] = None   # now | next-heartbeat
    enabled:        Optional[bool] = None
    timeout_seconds: Optional[int] = None


@router.patch("/{job_id}", tags=["crons"])
def edit_cron_job(job_id: str, body: EditCronRequest, current_user=Depends(get_current_user)):
    cmd = ["openclaw", "cron", "edit", job_id]

    if body.name           is not None: cmd.extend(["--name",            body.name])
    if body.cron           is not None: cmd.extend(["--cron",            body.cron])
    if body.tz             is not None: cmd.extend(["--tz",              body.tz])
    if body.session        is not None: cmd.extend(["--session",         body.session])
    if body.wake           is not None: cmd.extend(["--wake",            body.wake])
    if body.timeout_seconds is not None: cmd.extend(["--timeout-seconds", str(body.timeout_seconds)])

    if body.enabled is True:  cmd.append("--enable")
    if body.enabled is False: cmd.append("--disable")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            raise HTTPException(status_code=400, detail=result.stderr.strip() or "Edit failed")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="openclaw timed out")

    return {"ok": True, "job_id": job_id}

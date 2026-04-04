"""
Coding agents router — running instances + config info.
"""
import json
import os
import subprocess
import sys
from pathlib import Path
from datetime import datetime

import psutil
from fastapi import APIRouter, Depends
from ..auth import get_current_user

router = APIRouter()


def _first_existing_path(*candidates: str) -> Path:
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate).expanduser()
        if path.exists():
            return path
    return Path(candidates[0]).expanduser()


AGENT_STATUS_FILE = _first_existing_path(
    os.getenv('CLAWMISSIONS_AGENT_STATUS_FILE', ''),
    '/Users/tiali/clawmissions-data/agent_status.json',
)
CODEX_CONFIG = _first_existing_path(
    os.getenv('CLAWMISSIONS_CODEX_CONFIG', ''),
    '/Users/tiali/.codex/config.toml',
    str(Path.home() / '.codex' / 'config.toml'),
)
CLAUDE_CONFIG = _first_existing_path(
    os.getenv('CLAWMISSIONS_CLAUDE_CONFIG', ''),
    '/Users/tiali/.claude.json',
    str(Path.home() / '.claude.json'),
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _toml_load(path: Path) -> dict:
    """Load TOML using stdlib tomllib (py311+) or fallback line parser."""
    try:
        if sys.version_info >= (3, 11):
            import tomllib
            return tomllib.loads(path.read_text(encoding="utf-8"))
    except Exception:
        pass
    # Minimal fallback: parse simple key=value + [section] lines
    data: dict = {}
    current: dict = data
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("["):
            # nested section handling skipped for simplicity
            continue
        if "=" in line:
            k, _, v = line.partition("=")
            k = k.strip()
            v = v.strip().strip('"')
            current[k] = v
    return data


def _cmd_which(tool: str) -> str | None:
    env_key = f'CLAWMISSIONS_{tool.upper()}_PATH'
    forced = os.getenv(env_key)
    if forced:
        forced_path = Path(forced).expanduser()
        if forced_path.exists():
            return str(forced_path)
    try:
        r = subprocess.run(['which', tool], capture_output=True, text=True, timeout=3)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def _cmd_version(tool: str) -> str | None:
    try:
        r = subprocess.run([tool, "--version"], capture_output=True, text=True, timeout=5)
        return (r.stdout.strip() or r.stderr.strip()) or None
    except Exception:
        return None


# ── running processes ─────────────────────────────────────────────────────────

def _get_running_agents() -> list[dict]:
    results = []
    try:
        for proc in psutil.process_iter(
            ["pid", "name", "cmdline", "cpu_percent", "memory_info", "create_time", "status"]
        ):
            try:
                cmdline = proc.info.get("cmdline") or []
                cmd_str = " ".join(cmdline)
                name = proc.info.get("name", "") or ""

                agent_type = None

                # Codex
                if name.lower() in ("codex", "codex-cli"):
                    agent_type = "codex"
                elif "codex" in cmd_str.lower() and ("exec" in cmd_str or "codex" in cmdline[:2]):
                    agent_type = "codex"

                # Claude Code
                elif name.lower() == "claude":
                    agent_type = "claude"
                elif "claude" in cmd_str.lower() and any(
                    flag in cmd_str for flag in ["--dangerously-skip", "--print", "-p "]
                ):
                    agent_type = "claude"

                if not agent_type:
                    continue

                mem = proc.info.get("memory_info")
                create_ts = proc.info.get("create_time")
                results.append({
                    "pid": proc.info["pid"],
                    "type": agent_type,
                    "name": name,
                    "cmd": cmd_str[:250],
                    "cmd_short": " ".join(cmdline[:4])[:80],
                    "status": proc.info.get("status", "unknown"),
                    "cpu_percent": round(proc.info.get("cpu_percent") or 0, 1),
                    "memory_mb": round(mem.rss / 1024 / 1024, 1) if mem else 0,
                    "create_time": create_ts,
                    "started_at": (
                        datetime.fromtimestamp(create_ts).strftime("%H:%M:%S")
                        if create_ts
                        else None
                    ),
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception:
        pass
    return results


# ── config readers ────────────────────────────────────────────────────────────

def _codex_config() -> dict:
    path = _cmd_which("codex")
    version = _cmd_version("codex") if path else None
    cfg: dict = {
        "installed": path is not None,
        "path": path,
        "version": version,
        "model": None,
        "reasoning_effort": None,
        "trusted_paths": [],
    }
    if CODEX_CONFIG.exists():
        try:
            data = _toml_load(CODEX_CONFIG)
            cfg["model"] = data.get("model")
            cfg["reasoning_effort"] = data.get("model_reasoning_effort")
            projects = data.get("projects") or {}
            if isinstance(projects, dict):
                cfg["trusted_paths"] = [
                    {"path": k, "trust_level": (v or {}).get("trust_level", "trusted")}
                    for k, v in projects.items()
                ]
        except Exception:
            pass
    return cfg


def _claude_config() -> dict:
    path = _cmd_which("claude")
    version = _cmd_version("claude") if path else None
    cfg: dict = {
        "installed": path is not None,
        "path": path,
        "version": version,
        "model": "claude-sonnet-4-6",
        "account": None,
        "display_name": None,
        "organization": None,
        "billing_type": None,
        "subscription_created": None,
    }
    if CLAUDE_CONFIG.exists():
        try:
            data = json.loads(CLAUDE_CONFIG.read_text(encoding="utf-8"))
            acct = data.get("oauthAccount") or {}
            if acct:
                cfg["account"] = acct.get("emailAddress")
                cfg["display_name"] = acct.get("displayName")
                cfg["organization"] = acct.get("organizationName")
                cfg["billing_type"] = acct.get("billingType")
                sub_ts = acct.get("subscriptionCreatedAt")
                if sub_ts:
                    cfg["subscription_created"] = sub_ts[:10]
        except Exception:
            pass
    return cfg


def _load_status_file() -> dict | None:
    try:
        if AGENT_STATUS_FILE.exists():
            data = json.loads(AGENT_STATUS_FILE.read_text(encoding='utf-8'))
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return None


# ── routes ────────────────────────────────────────────────────────────────────

@router.get('/agents', tags=['system'])
def get_agents(current_user=Depends(get_current_user)):
    """Return running coding agent processes and configuration for all known agents."""
    status = _load_status_file() or {}
    running = status.get('running') if isinstance(status.get('running'), list) else _get_running_agents()
    return {
        'running': running,
        'running_count': len(running),
        'status_source': 'file' if status.get('running') is not None else 'local',
        'status_file': str(AGENT_STATUS_FILE),
        'status_generated_at': status.get('generated_at'),
        'configs': {
            'codex': _codex_config(),
            'claude': _claude_config(),
        },
    }

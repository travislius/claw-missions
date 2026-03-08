import glob
import json
import os
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

import psutil
from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user

router = APIRouter()

CLAWD_DIR = Path("/Users/tiali/clawd")
SESSIONS_DIR = Path("/Users/tiali/.openclaw/agents/main/sessions")
PROJECTS_FILE = Path("/Users/tiali/clawd/PROJECTS.md")


@router.get("/memory", tags=["system"])
def get_memory(current_user=Depends(get_current_user)):
    """Return Tia's soul, long-term memory, and recent daily logs."""
    def read_file(path):
        try:
            return Path(path).read_text(encoding="utf-8")
        except Exception:
            return None

    today = datetime.now().strftime("%Y-%m-%d")

    # Find last 3 daily memory files
    daily_files = sorted(
        glob.glob(str(CLAWD_DIR / "memory" / "*.md")),
        reverse=True
    )[:3]
    daily = []
    for f in daily_files:
        content = read_file(f)
        if content:
            daily.append({"date": Path(f).stem, "content": content})

    return {
        "soul": read_file(CLAWD_DIR / "SOUL.md"),
        "memory": read_file(CLAWD_DIR / "MEMORY.md"),
        "daily": daily,
        "today": today,
    }

_boot_time = psutil.boot_time()

# For live network speed calculation
_net_last = {"time": time.time(), "sent": 0, "recv": 0, "ready": False}


def _fmt_bytes(n: int) -> dict:
    """Return bytes + human-friendly string."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return {"bytes": n, "human": f"{n:.1f} {unit}"}
        n /= 1024
    return {"bytes": n * 1024 ** 4, "human": f"{n:.1f} PB"}


@router.get("/resources", tags=["system"])
def get_resources(current_user=Depends(get_current_user)):
    # CPU
    cpu_percent = psutil.cpu_percent(interval=0.2)
    cpu_per_core = psutil.cpu_percent(interval=0.2, percpu=True)
    cpu_freq = psutil.cpu_freq()
    cpu_count = psutil.cpu_count(logical=True)
    cpu_count_physical = psutil.cpu_count(logical=False)
    load_avg = list(psutil.getloadavg()) if hasattr(psutil, "getloadavg") else []

    # RAM
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()

    # Disk — only show root + real external volumes (skip macOS system sub-volumes)
    _seen_devices = set()
    disks = []
    for part in psutil.disk_partitions(all=False):
        mp = part.mountpoint
        # Skip macOS hidden system volumes, simulator images, and duplicate mounts
        if mp.startswith("/System/Volumes/"):
            continue
        if mp.startswith("/Library/Developer/"):
            continue
        if part.device in _seen_devices:
            continue
        _seen_devices.add(part.device)
        try:
            usage = psutil.disk_usage(mp)
            # Skip tiny partitions < 1 GB (firmware/recovery volumes)
            if usage.total < 1 * 1024 ** 3:
                continue
            disks.append({
                "device": part.device,
                "mountpoint": mp,
                "fstype": part.fstype,
                "total": _fmt_bytes(usage.total),
                "used": _fmt_bytes(usage.used),
                "free": _fmt_bytes(usage.free),
                "percent": usage.percent,
            })
        except (PermissionError, OSError):
            pass

    # Network I/O — cumulative + live speed via delta
    net_io = psutil.net_io_counters()
    net_if = psutil.net_if_stats()
    active_ifaces = [k for k, v in net_if.items() if v.isup and k != "lo"]

    now = time.time()
    elapsed = now - _net_last["time"]
    if _net_last["ready"] and elapsed > 0:
        upload_bps   = (net_io.bytes_sent - _net_last["sent"]) / elapsed
        download_bps = (net_io.bytes_recv - _net_last["recv"]) / elapsed
    else:
        upload_bps = download_bps = 0.0
    _net_last.update({"time": now, "sent": net_io.bytes_sent, "recv": net_io.bytes_recv, "ready": True})

    # Uptime
    uptime_secs = int(time.time() - _boot_time)
    days, rem = divmod(uptime_secs, 86400)
    hours, rem = divmod(rem, 3600)
    minutes = rem // 60

    # Processes
    proc_count = len(psutil.pids())

    return {
        "cpu": {
            "percent": cpu_percent,
            "per_core": cpu_per_core,
            "count_logical": cpu_count,
            "count_physical": cpu_count_physical,
            "freq_mhz": round(cpu_freq.current) if cpu_freq else None,
            "freq_max_mhz": round(cpu_freq.max) if cpu_freq else None,
            "load_avg": load_avg,
        },
        "memory": {
            "total": _fmt_bytes(mem.total),
            "used": _fmt_bytes(mem.used),
            "available": _fmt_bytes(mem.available),
            "percent": mem.percent,
            "swap_total": _fmt_bytes(swap.total),
            "swap_used": _fmt_bytes(swap.used),
            "swap_percent": swap.percent,
        },
        "disks": disks,
        "network": {
            "bytes_sent": _fmt_bytes(net_io.bytes_sent),
            "bytes_recv": _fmt_bytes(net_io.bytes_recv),
            "packets_sent": net_io.packets_sent,
            "packets_recv": net_io.packets_recv,
            "active_interfaces": active_ifaces,
            "upload_speed": _fmt_bytes(max(0, upload_bps)),
            "download_speed": _fmt_bytes(max(0, download_bps)),
        },
        "system": {
            "uptime_seconds": uptime_secs,
            "uptime_human": f"{days}d {hours}h {minutes}m",
            "process_count": proc_count,
            "boot_time": _boot_time,
        },
    }


# ── Max (Windows PC) resources via SSH ──────────────────────────────────────

_MAX_SSH = "tiali@100.84.71.61"

_PS_SCRIPT = r"""
$ErrorActionPreference = 'Stop'
$cpu = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os  = Get-WmiObject Win32_OperatingSystem
$cs  = Get-WmiObject Win32_ComputerSystem
$memTotal = [long]$os.TotalVisibleMemorySize * 1024
$memFree  = [long]$os.FreePhysicalMemory * 1024
$memUsed  = $memTotal - $memFree
$memPct   = [math]::Round($memUsed / $memTotal * 100, 1)
$disks = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | ForEach-Object {
  $total = $_.Used + $_.Free
  @{ letter=$_.Name; used=$_.Used; free=$_.Free; total=$total;
     pct=[math]::Round($_.Used/$total*100,1) }
}
$net = Get-NetAdapterStatistics | Where-Object { $_.ReceivedBytes -gt 0 } | Select-Object -First 1
$gpu = (Get-WmiObject -Namespace "root\cimv2" -Class Win32_VideoController | Where-Object { $_.AdapterRAM -gt 100MB } | Select-Object -First 1)
$proc = (Get-Process).Count
$uptime = (Get-Date) - $os.ConvertToDateTime($os.LastBootUpTime)
[ordered]@{
  cpu_pct    = [math]::Round($cpu, 1)
  mem_total  = $memTotal
  mem_used   = $memUsed
  mem_free   = $memFree
  mem_pct    = $memPct
  disks      = $disks
  proc_count = $proc
  uptime_sec = [long]$uptime.TotalSeconds
  gpu_name   = if($gpu) { $gpu.Name } else { $null }
  gpu_ram_gb = if($gpu) { [math]::Round($gpu.AdapterRAM/1GB,1) } else { $null }
} | ConvertTo-Json -Depth 4
"""


def _fmt(n: int | float) -> dict:
    n = int(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return {"bytes": n, "human": f"{n:.1f} {unit}"}
        n //= 1024
    return {"bytes": n * 1024 ** 4, "human": f"{n:.1f} PB"}


@router.get("/resources/max", tags=["system"])
def get_resources_max(current_user=Depends(get_current_user)):
    """Fetch Max (Windows PC) system resources via SSH + PowerShell."""
    try:
        result = subprocess.run(
            ["ssh", "-q",
             "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
             "-o", "StrictHostKeyChecking=no",
             "-o", "LogLevel=ERROR",
             _MAX_SSH, f"powershell -NoProfile -NonInteractive -Command \"{_PS_SCRIPT.strip()}\""],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            raise HTTPException(status_code=503, detail=f"SSH failed: {result.stderr[:200]}")

        raw = json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=503, detail="Max unreachable (timeout)")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Bad response from Max: {e}")

    uptime_secs = int(raw.get("uptime_sec", 0))
    days, rem = divmod(uptime_secs, 86400)
    hours, rem = divmod(rem, 3600)
    minutes = rem // 60

    disks = []
    for d in (raw.get("disks") or []):
        total = int(d.get("total") or 0)
        if total < 1 * 1024 ** 3:
            continue
        disks.append({
            "device": f"{d['letter']}:",
            "mountpoint": f"{d['letter']}:\\",
            "fstype": "NTFS",
            "total": _fmt(total),
            "used": _fmt(int(d.get("used") or 0)),
            "free": _fmt(int(d.get("free") or 0)),
            "percent": float(d.get("pct") or 0),
        })

    return {
        "cpu": {
            "percent": float(raw.get("cpu_pct") or 0),
            "per_core": [],
            "count_logical": None,
            "count_physical": None,
            "freq_mhz": None,
            "freq_max_mhz": None,
            "load_avg": [],
        },
        "memory": {
            "total": _fmt(int(raw.get("mem_total") or 0)),
            "used": _fmt(int(raw.get("mem_used") or 0)),
            "available": _fmt(int(raw.get("mem_free") or 0)),
            "percent": float(raw.get("mem_pct") or 0),
            "swap_total": {"bytes": 0, "human": "0.0 B"},
            "swap_used": {"bytes": 0, "human": "0.0 B"},
            "swap_percent": 0,
        },
        "disks": disks,
        "network": {
            "bytes_sent": {"bytes": 0, "human": "—"},
            "bytes_recv": {"bytes": 0, "human": "—"},
            "packets_sent": 0,
            "packets_recv": 0,
            "active_interfaces": [],
            "upload_speed": {"bytes": 0, "human": "—"},
            "download_speed": {"bytes": 0, "human": "—"},
        },
        "gpu": {
            "name": raw.get("gpu_name"),
            "vram_gb": raw.get("gpu_ram_gb"),
        },
        "system": {
            "uptime_seconds": uptime_secs,
            "uptime_human": f"{days}d {hours}h {minutes}m",
            "process_count": int(raw.get("proc_count") or 0),
            "boot_time": None,
        },
    }


_ZED_SSH = "zed@100.125.85.113"

_ZED_SCRIPT = """\
import json, psutil, time
mem  = psutil.virtual_memory()
swap = psutil.swap_memory()
cpu  = psutil.cpu_percent(interval=0.3)
cpu_cores = psutil.cpu_percent(interval=0.3, percpu=True)
freq = psutil.cpu_freq()
net  = psutil.net_io_counters()
boot = psutil.boot_time()
uptime = int(time.time() - boot)
days, rem = divmod(uptime, 86400)
hours, rem2 = divmod(rem, 3600)
mins = rem2 // 60
uptime_h = (f"{days}d " if days else "") + f"{hours}h {mins}m"
seen = set()
disks = []
for p in psutil.disk_partitions(all=False):
    if p.device in seen: continue
    seen.add(p.device)
    try:
        u = psutil.disk_usage(p.mountpoint)
        if u.total < 1024**3: continue
        disks.append({"device": p.device, "mountpoint": p.mountpoint, "fstype": p.fstype,
            "total_b": u.total, "used_b": u.used, "free_b": u.free, "percent": u.percent})
    except: pass
print(json.dumps({"cpu": cpu, "cpu_cores": cpu_cores,
    "cpu_phys": psutil.cpu_count(logical=False), "cpu_logi": psutil.cpu_count(logical=True),
    "freq": round(freq.current) if freq else None, "freq_max": round(freq.max) if freq else None,
    "load": list(psutil.getloadavg()),
    "mem_total": mem.total, "mem_used": mem.used, "mem_avail": mem.available, "mem_pct": mem.percent,
    "swap_total": swap.total, "swap_used": swap.used, "swap_pct": swap.percent,
    "disks": disks, "procs": len(psutil.pids()),
    "net_sent": net.bytes_sent, "net_recv": net.bytes_recv,
    "net_pkts_sent": net.packets_sent, "net_pkts_recv": net.packets_recv,
    "uptime_h": uptime_h, "uptime_s": uptime}))
"""


@router.get("/resources/zed", tags=["system"])
def get_resources_zed(current_user=Depends(get_current_user)):
    """Fetch Zed (HP ZBook Ultra / Linux) system resources via SSH."""
    try:
        result = subprocess.run(
            ["ssh", "-q", "-o", "ConnectTimeout=8", "-o", "BatchMode=yes",
             "-o", "StrictHostKeyChecking=no", "-o", "LogLevel=ERROR",
             _ZED_SSH, "python3"],
            input=_ZED_SCRIPT,
            capture_output=True, text=True, timeout=20
        )
        if result.returncode != 0:
            raise HTTPException(status_code=503, detail=f"SSH failed: {result.stderr[:200]}")
        raw = json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=503, detail="Zed unreachable (timeout)")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Bad response from Zed: {e}")

    disks = []
    for d in (raw.get("disks") or []):
        disks.append({
            "device": d["device"], "mountpoint": d["mountpoint"], "fstype": d["fstype"],
            "total": _fmt(d["total_b"]), "used": _fmt(d["used_b"]),
            "free": _fmt(d["free_b"]), "percent": d["percent"],
        })

    uptime_secs = int(raw.get("uptime_s", 0))

    return {
        "cpu": {
            "percent": float(raw.get("cpu") or 0),
            "per_core": raw.get("cpu_cores") or [],
            "count_logical": raw.get("cpu_logi"),
            "count_physical": raw.get("cpu_phys"),
            "freq_mhz": raw.get("freq"),
            "freq_max_mhz": raw.get("freq_max"),
            "load_avg": raw.get("load") or [],
        },
        "memory": {
            "total": _fmt(int(raw.get("mem_total") or 0)),
            "used": _fmt(int(raw.get("mem_used") or 0)),
            "available": _fmt(int(raw.get("mem_avail") or 0)),
            "percent": float(raw.get("mem_pct") or 0),
            "swap_total": _fmt(int(raw.get("swap_total") or 0)),
            "swap_used": _fmt(int(raw.get("swap_used") or 0)),
            "swap_percent": float(raw.get("swap_pct") or 0),
        },
        "disks": disks,
        "network": {
            "bytes_sent": _fmt(int(raw.get("net_sent") or 0)),
            "bytes_recv": _fmt(int(raw.get("net_recv") or 0)),
            "packets_sent": raw.get("net_pkts_sent") or 0,
            "packets_recv": raw.get("net_pkts_recv") or 0,
            "active_interfaces": ["wlp193s0"],
            "upload_speed": {"bytes": 0, "human": "—"},
            "download_speed": {"bytes": 0, "human": "—"},
        },
        "gpu": {
            "name": "Radeon 890M (unified)",
            "vram_gb": 32,
        },
        "system": {
            "uptime_seconds": uptime_secs,
            "uptime_human": raw.get("uptime_h") or "—",
            "process_count": int(raw.get("procs") or 0),
            "boot_time": None,
        },
    }


@router.get("/sessions", tags=["system"])
def get_sessions(current_user=Depends(get_current_user)):
    """Return OpenClaw session list with stats."""
    sessions_file = SESSIONS_DIR / "sessions.json"
    try:
        raw = json.loads(sessions_file.read_text())
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cannot read sessions: {e}")

    sessions = []
    for key, meta in raw.items():
        parts = key.split(":")
        if len(parts) >= 3:
            kind = parts[2]
        else:
            kind = "unknown"

        msg_count = 0
        last_msg = None
        session_id = meta.get("sessionId", "")
        jsonl_path = SESSIONS_DIR / f"{session_id}.jsonl"
        if jsonl_path.exists():
            try:
                lines = jsonl_path.read_text(encoding="utf-8", errors="ignore").strip().split("\n")
                for line in lines:
                    if not line.strip():
                        continue
                    try:
                        obj = json.loads(line)
                        role = obj.get("role")
                        if role in ("user", "assistant"):
                            msg_count += 1
                            content = obj.get("content", "")
                            if isinstance(content, str) and content.strip():
                                last_msg = {"role": role, "text": content[:120]}
                            elif isinstance(content, list):
                                for block in content:
                                    if isinstance(block, dict) and block.get("type") == "text":
                                        text = block.get("text", "")[:120]
                                        if text.strip():
                                            last_msg = {"role": role, "text": text}
                                            break
                    except Exception:
                        continue
            except Exception:
                pass

        origin = meta.get("origin", {})
        label = meta.get("label") or origin.get("label") or key

        sessions.append({
            "key": key,
            "kind": kind,
            "label": label,
            "session_id": session_id,
            "model": meta.get("model", "unknown"),
            "model_provider": meta.get("modelProvider", ""),
            "updated_at": meta.get("updatedAt"),
            "chat_type": meta.get("chatType", ""),
            "compaction_count": meta.get("compactionCount", 0),
            "input_tokens": meta.get("inputTokens", 0),
            "output_tokens": meta.get("outputTokens", 0),
            "cache_read": meta.get("cacheRead", 0),
            "cache_write": meta.get("cacheWrite", 0),
            "total_tokens": meta.get("totalTokens", 0),
            "context_tokens": meta.get("contextTokens", 0),
            "message_count": msg_count,
            "last_message": last_msg,
            "auth_profile": meta.get("authProfileOverride", ""),
        })

    sessions.sort(key=lambda s: s["updated_at"] or 0, reverse=True)

    total_input = sum(s["input_tokens"] for s in sessions)
    total_output = sum(s["output_tokens"] for s in sessions)
    total_cache_read = sum(s["cache_read"] for s in sessions)

    return {
        "sessions": sessions,
        "total": len(sessions),
        "stats": {
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_cache_read": total_cache_read,
            "total_tokens": total_input + total_output,
        }
    }


BUILTIN_SKILLS_DIR = Path("/opt/homebrew/lib/node_modules/openclaw/skills")
USER_SKILLS_DIR = Path.home() / "clawd" / "skills"


def _parse_skill(skill_dir: Path, source: str) -> dict:
    """Parse a SKILL.md frontmatter into a skill dict."""
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.exists():
        return None
    try:
        text = skill_file.read_text(encoding="utf-8")
        name = skill_dir.name
        description = ""
        emoji = ""
        # Parse YAML-ish frontmatter between --- markers
        if text.startswith("---"):
            end = text.find("---", 3)
            if end > 0:
                front = text[3:end]
                for line in front.splitlines():
                    if line.startswith("name:"):
                        name = line.split(":", 1)[1].strip().strip('"')
                    elif line.startswith("description:"):
                        description = line.split(":", 1)[1].strip().strip('"')
                    elif '"emoji":' in line:
                        import re
                        m = re.search(r'"emoji":\s*"([^"]+)"', line)
                        if m:
                            emoji = m.group(1)
        stat = skill_file.stat()
        return {
            "id": skill_dir.name,
            "name": name,
            "description": description,
            "emoji": emoji,
            "source": source,
            "path": str(skill_dir),
            "updated_at": int(stat.st_mtime * 1000),
        }
    except Exception:
        return None


@router.get("/skills", tags=["system"])
def get_skills(current_user=Depends(get_current_user)):
    """Return all installed skills (builtin + user)."""
    skills = []
    for skills_dir, source in [(USER_SKILLS_DIR, "user"), (BUILTIN_SKILLS_DIR, "builtin")]:
        if skills_dir.exists():
            for skill_dir in sorted(skills_dir.iterdir()):
                if skill_dir.is_dir():
                    skill = _parse_skill(skill_dir, source)
                    if skill:
                        skills.append(skill)
    # Sort: user skills first, then builtin, both alphabetical
    skills.sort(key=lambda s: (0 if s["source"] == "user" else 1, s["name"].lower()))
    return {"skills": skills, "total": len(skills)}


@router.patch("/projects", tags=["system"])
def update_project_section(
    payload: dict,
    current_user=Depends(get_current_user),
):
    """Update a specific section in PROJECTS.md."""
    import re

    section = payload.get("section")
    content = payload.get("content")
    if not section or not content:
        raise HTTPException(status_code=400, detail="section and content required")

    try:
        full = PROJECTS_FILE.read_text(encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cannot read PROJECTS.md: {e}")

    pattern = rf'(## {re.escape(section)}.*?)(?=\n## |\Z)'
    replacement = content.rstrip()
    new_full, count = re.subn(pattern, lambda _: replacement, full, flags=re.DOTALL)
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Section '{section}' not found")

    PROJECTS_FILE.write_text(new_full, encoding="utf-8")
    return {"ok": True}


@router.delete("/projects", tags=["system"])
def delete_project_section(
    payload: dict,
    current_user=Depends(get_current_user),
):
    """Delete a specific ## section from PROJECTS.md."""
    import re

    section = payload.get("section")
    if not section:
        raise HTTPException(status_code=400, detail="section required")

    try:
        full = PROJECTS_FILE.read_text(encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cannot read PROJECTS.md: {e}")

    # Match the section and everything until the next ## heading or end of file
    pattern = rf'\n## {re.escape(section)}.*?(?=\n## |\Z)'
    new_full, count = re.subn(pattern, "", full, flags=re.DOTALL)
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Section '{section}' not found")

    PROJECTS_FILE.write_text(new_full.rstrip() + "\n", encoding="utf-8")
    return {"ok": True}


@router.get("/skills/{skill_id}", tags=["system"])
def get_skill_content(skill_id: str, current_user=Depends(get_current_user)):
    """Return the raw SKILL.md content for a given skill id."""
    for skills_dir in [USER_SKILLS_DIR, BUILTIN_SKILLS_DIR]:
        skill_file = skills_dir / skill_id / "SKILL.md"
        if skill_file.exists():
            # Security: ensure we don't escape the skills dirs
            try:
                skill_file.resolve().relative_to(skills_dir.resolve())
            except ValueError:
                raise HTTPException(status_code=403, detail="Access denied")
            content = skill_file.read_text(encoding="utf-8")
            stat = skill_file.stat()
            return {
                "id": skill_id,
                "content": content,
                "path": str(skill_file),
                "updated_at": int(stat.st_mtime * 1000),
            }
    raise HTTPException(status_code=404, detail=f"Skill '{skill_id}' not found")


@router.get("/projects", tags=["system"])
def get_projects(current_user=Depends(get_current_user)):
    """Return PROJECTS.md content and metadata."""
    try:
        content = PROJECTS_FILE.read_text(encoding="utf-8")
        stat = PROJECTS_FILE.stat()
        return {
            "content": content,
            "updated_at": int(stat.st_mtime * 1000),
            "size": stat.st_size,
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Cannot read PROJECTS.md: {e}")

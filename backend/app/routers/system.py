import glob
import json
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

import psutil
from fastapi import APIRouter, Depends, HTTPException
from ..auth import get_current_user

router = APIRouter()

CLAWD_DIR = Path("/Users/tiali/clawd")


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

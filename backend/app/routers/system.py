import glob
import json
import os
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

import psutil
from fastapi import APIRouter, Depends, HTTPException, Query
from ..auth import get_current_user

router = APIRouter()

CLAWD_DIR = Path("/Users/tiali/clawd")
SESSIONS_DIR = Path("/Users/tiali/.openclaw/agents/main/sessions")
PROJECTS_FILE = Path("/Users/tiali/clawd/PROJECTS.md")
HOST_STATS_FILE = Path("/Users/tiali/clawmissions-data/host_stats.json")


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


MONITORED_SITES = [
    {"id": "ai-blog",       "name": "OctoDance AI Blog",  "url": "https://ai.octodance.com"},
    {"id": "lazyai",        "name": "Lazy AI Studio",     "url": "https://lazyaistudio.com"},
    {"id": "wordmonsters",  "name": "Word Monsters",      "url": "https://wordmonsters.octodance.com"},
    {"id": "landing",       "name": "OctoDance Landing",  "url": "https://www.octodance.com"},
    {"id": "sparknexus",    "name": "SparkNexus",         "url": "https://sparknexus.ai"},
]


@router.get("/health-check", tags=["system"])
def health_check(current_user=Depends(get_current_user)):
    """Check all monitored production sites and return status."""
    import urllib.request
    import urllib.error

    results = []
    for site in MONITORED_SITES:
        t0 = time.time()
        try:
            req = urllib.request.Request(site["url"], method="GET")
            req.add_header("User-Agent", "ClawMissions-HealthCheck/1.0")
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.status
            latency = int((time.time() - t0) * 1000)
            results.append({
                **site,
                "status": status,
                "ok": 200 <= status < 400,
                "latency_ms": latency,
            })
        except urllib.error.HTTPError as e:
            latency = int((time.time() - t0) * 1000)
            results.append({
                **site,
                "status": e.code,
                "ok": False,
                "latency_ms": latency,
            })
        except Exception as e:
            results.append({
                **site,
                "status": 0,
                "ok": False,
                "latency_ms": None,
                "error": str(e)[:200],
            })

    return {
        "sites": results,
        "all_ok": all(r["ok"] for r in results),
        "checked_at": int(time.time() * 1000),
    }


@router.get("/resources", tags=["system"])
def get_resources(current_user=Depends(get_current_user)):
    # Prefer host stats file written by sync_host_stats.sh (accurate Mac Mini data)
    # Falls back to psutil (which reads Docker container stats, not host)
    try:
        if HOST_STATS_FILE.exists():
            data = json.loads(HOST_STATS_FILE.read_text())
            age_ms = int(time.time() * 1000) - data.get("_ts", 0)
            if age_ms < 120_000:  # use if less than 2 minutes old
                return data
    except Exception:
        pass

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

    # Disk — only show Tia's main disk plus the external SSD
    _seen_devices = set()
    _allowed_mounts = {"/", "/Volumes/Tia Ext"}
    disks = []
    for part in psutil.disk_partitions(all=False):
        mp = part.mountpoint
        if mp not in _allowed_mounts:
            continue
        if part.device in _seen_devices:
            continue
        _seen_devices.add(part.device)
        try:
            usage = psutil.disk_usage(mp)
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


# ── Max (Linux server) resources via SSH ────────────────────────────────────

_MAX_SSH = "max@100.118.6.47"

_LINUX_SCRIPT = r"""
python3 -c "
import json, subprocess, os, time

# CPU
with open('/proc/stat') as f:
    line = f.readline().split()
idle1 = int(line[4]); total1 = sum(int(x) for x in line[1:])
time.sleep(0.2)
with open('/proc/stat') as f:
    line = f.readline().split()
idle2 = int(line[4]); total2 = sum(int(x) for x in line[1:])
cpu_pct = round(100 * (1 - (idle2-idle1)/(total2-total1)), 1)

# CPU cores + load avg
try:
    cpu_cores = len([l for l in open('/proc/cpuinfo').readlines() if l.startswith('processor')])
    load_avg = [round(float(x),2) for x in open('/proc/loadavg').read().split()[:3]]
except:
    cpu_cores = None; load_avg = []

# Memory
mem = {}
with open('/proc/meminfo') as f:
    for l in f:
        k,v = l.split(':')
        mem[k.strip()] = int(v.strip().split()[0]) * 1024
mem_total = mem['MemTotal']
mem_free  = mem['MemAvailable']
mem_used  = mem_total - mem_free
mem_pct   = round(mem_used / mem_total * 100, 1)

# Uptime
with open('/proc/uptime') as f:
    uptime_sec = int(float(f.read().split()[0]))

# Disks - include root + all /mnt/* mounts, skip boot/snap
SKIP_FS = {'tmpfs','devtmpfs','squashfs','overlay','efivarfs','iso9660'}
SKIP_MNT = {'/boot','/boot/efi','/run','/dev','/sys','/proc'}
disks = []
for line in subprocess.check_output(['df','-B1','--output=source,target,fstype,size,used,avail,pcent']).decode().splitlines()[1:]:
    parts = line.split()
    if len(parts) < 7: continue
    src,mnt,fs,size,used,avail,pct = parts
    if fs in SKIP_FS: continue
    if any(mnt == s or mnt.startswith(s+'/') for s in SKIP_MNT): continue
    if int(size) < 500*1024**2: continue
    disks.append({'device':src,'mountpoint':mnt,'fstype':fs,'total':int(size),'used':int(used),'free':int(avail),'pct':float(pct.rstrip('%'))})

# Process count
proc_count = sum(1 for e in os.listdir('/proc') if e.isdigit())

# GPU - try nvidia-smi first, fall back to lspci
gpu_name = None; gpu_ram_gb = None; gpu_util = None; gpu_temp = None; gpu_mem_used = None; gpu_mem_total = None; gpu_power = None; gpu_power_cap = None
try:
    out = subprocess.check_output(['nvidia-smi','--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit','--format=csv,noheader,nounits'], timeout=3).decode().strip()
    parts = [p.strip() for p in out.split(',')]
    gpu_name = parts[0]
    gpu_mem_total = int(parts[1]) if len(parts) > 1 and parts[1] not in ('[N/A]','') else None
    gpu_ram_gb = round(gpu_mem_total / 1024, 1) if gpu_mem_total else None
    gpu_mem_used = int(parts[2]) if len(parts) > 2 and parts[2] not in ('[N/A]','') else None
    gpu_util = int(parts[3]) if len(parts) > 3 and parts[3] not in ('[N/A]','') else None
    gpu_temp = int(parts[4]) if len(parts) > 4 and parts[4] not in ('[N/A]','') else None
    gpu_power = float(parts[5]) if len(parts) > 5 and parts[5] not in ('[N/A]','') else None
    gpu_power_cap = float(parts[6]) if len(parts) > 6 and parts[6] not in ('[N/A]','') else None
except:
    try:
        lspci = subprocess.check_output(['lspci'], timeout=3).decode()
        for line in lspci.splitlines():
            if 'NVIDIA' in line and ('VGA' in line or '3D' in line):
                gpu_name = line.split(':')[-1].strip(); break
    except: pass

print(json.dumps({'cpu_pct':cpu_pct,'cpu_cores':cpu_cores,'load_avg':load_avg,'mem_total':mem_total,'mem_used':mem_used,'mem_free':mem_free,'mem_pct':mem_pct,'disks':disks,'proc_count':proc_count,'uptime_sec':uptime_sec,'gpu_name':gpu_name,'gpu_ram_gb':gpu_ram_gb,'gpu_util':gpu_util,'gpu_temp':gpu_temp,'gpu_mem_used':gpu_mem_used,'gpu_mem_total':gpu_mem_total,'gpu_power':gpu_power,'gpu_power_cap':gpu_power_cap}))
"
"""


def _fmt(n: int | float) -> dict:
    orig = int(n)
    f = float(orig)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if f < 1024:
            return {"bytes": orig, "human": f"{f:.1f} {unit}"}
        f /= 1024
    return {"bytes": orig, "human": f"{f:.1f} PB"}


@router.get("/resources/max", tags=["system"])
def get_resources_max(current_user=Depends(get_current_user)):
    """Fetch Max (Linux PC) system resources via SSH."""
    try:
        result = subprocess.run(
            ["ssh", "-q",
             "-o", "ConnectTimeout=5", "-o", "BatchMode=yes",
             "-o", "StrictHostKeyChecking=no",
             "-o", "LogLevel=ERROR",
             _MAX_SSH, _LINUX_SCRIPT.strip()],
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
            "device": d.get("device", ""),
            "mountpoint": d.get("mountpoint", ""),
            "fstype": d.get("fstype", ""),
            "total": _fmt(total),
            "used": _fmt(int(d.get("used") or 0)),
            "free": _fmt(int(d.get("free") or 0)),
            "percent": float(d.get("pct") or 0),
        })

    return {
        "cpu": {
            "percent": float(raw.get("cpu_pct") or 0),
            "per_core": [],
            "count_logical": raw.get("cpu_cores"),
            "count_physical": raw.get("cpu_cores"),
            "freq_mhz": None,
            "freq_max_mhz": None,
            "load_avg": raw.get("load_avg", []),
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
            "usage_pct": float(raw["gpu_util"]) if raw.get("gpu_util") is not None else None,
            "vram_used_gb": round(raw["gpu_mem_used"] / 1024, 2) if raw.get("gpu_mem_used") is not None else None,
            "temp_c": raw.get("gpu_temp"),
            "power_w": round(raw["gpu_power"], 1) if raw.get("gpu_power") is not None else None,
            "power_cap_w": round(raw["gpu_power_cap"], 1) if raw.get("gpu_power_cap") is not None else None,
        },
        "system": {
            "uptime_seconds": uptime_secs,
            "uptime_human": f"{days}d {hours}h {minutes}m",
            "process_count": int(raw.get("proc_count") or 0),
            "boot_time": None,
        },
    }


_ZED_SSH = "zed@100.125.85.113"


def _get_zed_llama_model() -> list:
    """Fetch the currently loaded model from llama-server on Zed."""
    try:
        result = subprocess.run(
            ["ssh", "-q", "-o", "ConnectTimeout=3", "-o", "BatchMode=yes",
             "-o", "StrictHostKeyChecking=no", _ZED_SSH,
             "curl -s http://localhost:8080/props"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout)
            model_path = data.get("model_path", "") or ""
            # Extract just the filename without extension
            model_name = os.path.basename(model_path).replace(".gguf", "") if model_path else None
            if model_name:
                # Try to get file size for display
                size_result = subprocess.run(
                    ["ssh", "-q", "-o", "ConnectTimeout=3", "-o", "BatchMode=yes",
                     "-o", "StrictHostKeyChecking=no", _ZED_SSH,
                     f"stat -c%s '{model_path}' 2>/dev/null || echo 0"],
                    capture_output=True, text=True, timeout=5
                )
                size_bytes = int(size_result.stdout.strip() or 0)
                return [{"name": model_name, "size_gb": round(size_bytes / 1024**3, 1)}]
    except Exception:
        pass
    return []

_ZED_SCRIPT = """\
import json, psutil, time, os

def _read(p):
    try: return open(p).read().strip()
    except: return None
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
GPU_PCI = "/sys/bus/pci/devices/0000:c3:00.0"
gpu_busy = _read(f"{GPU_PCI}/gpu_busy_percent")
gpu_vram_used = _read(f"{GPU_PCI}/mem_info_vram_used")
gpu_vram_total = _read(f"{GPU_PCI}/mem_info_vram_total")
gpu_temp_raw = _read("/sys/class/hwmon/hwmon7/temp1_input")
gpu_power_raw = _read("/sys/class/hwmon/hwmon7/power1_average")
print(json.dumps({"cpu": cpu, "cpu_cores": cpu_cores,
    "gpu_busy": int(gpu_busy) if gpu_busy else None,
    "gpu_vram_used_bytes": int(gpu_vram_used) if gpu_vram_used else None,
    "gpu_vram_total_bytes": int(gpu_vram_total) if gpu_vram_total else None,
    "gpu_temp_c": round(int(gpu_temp_raw)/1000, 1) if gpu_temp_raw else None,
    "gpu_power_w": round(int(gpu_power_raw)/1000000, 1) if gpu_power_raw else None,
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
            "name": "Radeon 8060S (Strix Halo / GFX1151)",
            "vram_gb": round(int(raw.get("gpu_vram_total_bytes") or 0) / 1024**3, 1) or 48,
            "vram_used_gb": round(int(raw.get("gpu_vram_used_bytes") or 0) / 1024**3, 1) if raw.get("gpu_vram_used_bytes") else None,
            "usage_pct": raw.get("gpu_busy"),
            "temp_c": raw.get("gpu_temp_c"),
            "power_w": raw.get("gpu_power_w"),
            "driver_note": None,
            "ollama_models": _get_zed_llama_model(),
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


def _first_existing_dir(*candidates: str) -> Path:
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate).expanduser()
        if path.exists():
            return path
    return Path(candidates[0]).expanduser()


BUILTIN_SKILLS_DIR = _first_existing_dir(
    os.getenv("CLAWMISSIONS_BUILTIN_SKILLS_DIR", ""),
    "/opt/homebrew/lib/node_modules/openclaw/skills",
    "/usr/local/lib/node_modules/openclaw/skills",
    "/app/openclaw/skills",
)
USER_SKILLS_DIR = _first_existing_dir(
    os.getenv("CLAWMISSIONS_USER_SKILLS_DIR", ""),
    str(CLAWD_DIR / "skills"),
    str(Path.home() / "clawd" / "skills"),
)


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


HERMES_SKILLS_DIR = Path.home() / ".hermes" / "skills"

# Map agent → (user_skills_dir, builtin_skills_dir)
_AGENT_SKILLS = {
    "tia": (USER_SKILLS_DIR, BUILTIN_SKILLS_DIR),
    "maru": (HERMES_SKILLS_DIR, None),
}


def _walk_skills(base_dir: Path, source: str, prefix: str = "") -> list[dict]:
    """Recursively find skills (supports category subdirectories)."""
    results = []
    if not base_dir.exists():
        return results
    for item in sorted(base_dir.iterdir()):
        if not item.is_dir():
            continue
        skill_file = item / "SKILL.md"
        if skill_file.exists():
            skill = _parse_skill(item, source)
            if skill:
                if prefix:
                    skill["category"] = prefix
                results.append(skill)
        else:
            # Might be a category directory — recurse
            sub = _walk_skills(item, source, prefix=item.name)
            results.extend(sub)
    return results


@router.get("/skills", tags=["system"])
def get_skills(
    agent: str = Query("tia", description="Agent ID: tia | maru"),
    current_user=Depends(get_current_user),
):
    """Return all installed skills (builtin + user) for a given agent."""
    user_dir, builtin_dir = _AGENT_SKILLS.get(agent, _AGENT_SKILLS["tia"])
    skills = []
    for skills_dir, source in [(user_dir, "user"), (builtin_dir, "builtin")]:
        if skills_dir:
            skills.extend(_walk_skills(skills_dir, source))
    # Sort: user skills first, then builtin, both alphabetical
    skills.sort(key=lambda s: (0 if s["source"] == "user" else 1, s["name"].lower()))
    return {"skills": skills, "total": len(skills), "agent": agent}


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


def _find_skill_file(skill_id: str) -> Path | None:
    """Search all agent skill directories (recursively) for a SKILL.md."""
    all_dirs = set()
    for user_dir, builtin_dir in _AGENT_SKILLS.values():
        if user_dir:
            all_dirs.add(user_dir)
        if builtin_dir:
            all_dirs.add(builtin_dir)
    for skills_dir in all_dirs:
        if not skills_dir.exists():
            continue
        # Direct match
        direct = skills_dir / skill_id / "SKILL.md"
        if direct.exists():
            return direct
        # Search subdirectories (category folders)
        for sub in skills_dir.iterdir():
            if sub.is_dir():
                nested = sub / skill_id / "SKILL.md"
                if nested.exists():
                    return nested
    return None


@router.get("/skills/{skill_id}", tags=["system"])
def get_skill_content(skill_id: str, current_user=Depends(get_current_user)):
    """Return the raw SKILL.md content for a given skill id."""
    skill_file = _find_skill_file(skill_id)
    if skill_file:
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

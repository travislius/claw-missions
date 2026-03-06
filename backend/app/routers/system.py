import time
import psutil
from fastapi import APIRouter, Depends
from ..auth import get_current_user

router = APIRouter()

_boot_time = psutil.boot_time()


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

    # Disk (all mounted partitions, skip pseudo-fs)
    disks = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disks.append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total": _fmt_bytes(usage.total),
                "used": _fmt_bytes(usage.used),
                "free": _fmt_bytes(usage.free),
                "percent": usage.percent,
            })
        except PermissionError:
            pass

    # Network I/O (delta since last call isn't tracked — return cumulative counters)
    net_io = psutil.net_io_counters()
    net_if = psutil.net_if_stats()
    active_ifaces = [k for k, v in net_if.items() if v.isup and k != "lo"]

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
        },
        "system": {
            "uptime_seconds": uptime_secs,
            "uptime_human": f"{days}d {hours}h {minutes}m",
            "process_count": proc_count,
            "boot_time": _boot_time,
        },
    }

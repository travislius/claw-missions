#!/usr/bin/env python3
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

try:
    import psutil
except ImportError:
    raise SystemExit('psutil is required: pip install psutil')

OUTPUT = Path(os.getenv('CLAWMISSIONS_AGENT_STATUS_FILE', '~/.clawmissions/agent_status.json')).expanduser()
OUTPUT.parent.mkdir(parents=True, exist_ok=True)


def cmd_which(tool: str):
    try:
        r = subprocess.run(['which', tool], capture_output=True, text=True, timeout=3)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def cmd_version(tool: str):
    try:
        r = subprocess.run([tool, '--version'], capture_output=True, text=True, timeout=5)
        return (r.stdout.strip() or r.stderr.strip()) or None
    except Exception:
        return None


def get_running_agents():
    results = []
    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cpu_percent', 'memory_info', 'create_time', 'status']):
        try:
            cmdline = proc.info.get('cmdline') or []
            cmd_str = ' '.join(cmdline)
            name = (proc.info.get('name') or '')
            agent_type = None

            if name.lower() in ('codex', 'codex-cli'):
                agent_type = 'codex'
            elif 'codex' in cmd_str.lower() and ('exec' in cmd_str or 'codex' in cmdline[:2]):
                agent_type = 'codex'
            elif name.lower() == 'claude':
                agent_type = 'claude'
            elif 'claude' in cmd_str.lower() and any(flag in cmd_str for flag in ['--dangerously-skip', '--print', '-p ']):
                agent_type = 'claude'

            if not agent_type:
                continue

            mem = proc.info.get('memory_info')
            create_ts = proc.info.get('create_time')
            results.append({
                'pid': proc.info['pid'],
                'type': agent_type,
                'name': name,
                'cmd': cmd_str[:250],
                'cmd_short': ' '.join(cmdline[:4])[:80],
                'status': proc.info.get('status', 'unknown'),
                'cpu_percent': round(proc.info.get('cpu_percent') or 0, 1),
                'memory_mb': round(mem.rss / 1024 / 1024, 1) if mem else 0,
                'create_time': create_ts,
                'started_at': datetime.fromtimestamp(create_ts).strftime('%H:%M:%S') if create_ts else None,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        except Exception:
            pass
    return results


def main():
    running = get_running_agents()
    payload = {
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'running': running,
        'running_count': len(running),
        'host': os.uname().nodename if hasattr(os, 'uname') else None,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(f'wrote {OUTPUT} with {len(running)} running agents')


if __name__ == '__main__':
    main()

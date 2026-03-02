import hashlib
import os
import uuid
from datetime import datetime

from ..config import settings


def get_storage_path() -> str:
    os.makedirs(settings.STORAGE, exist_ok=True)
    return settings.STORAGE


def compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def save_file(data: bytes, original_name: str) -> tuple[str, str]:
    """Save file to storage. Returns (relative_path, checksum)."""
    checksum = compute_sha256(data)
    # Organize by date/uuid to avoid collisions
    date_prefix = datetime.utcnow().strftime("%Y/%m")
    unique_name = f"{uuid.uuid4().hex}_{original_name}"
    rel_path = os.path.join(date_prefix, unique_name)
    abs_path = os.path.join(get_storage_path(), rel_path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "wb") as f:
        f.write(data)
    return rel_path, checksum


def get_abs_path(rel_path: str) -> str:
    return os.path.join(get_storage_path(), rel_path)


def delete_file(rel_path: str) -> bool:
    abs_path = get_abs_path(rel_path)
    if os.path.exists(abs_path):
        os.remove(abs_path)
        return True
    return False

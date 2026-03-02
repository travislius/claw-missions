import io
import os
import uuid

from ..config import settings

THUMB_SIZE = (200, 200)


def _get_thumbs_dir() -> str:
    path = os.path.join(settings.STORAGE, ".thumbs")
    os.makedirs(path, exist_ok=True)
    return path


def generate_thumbnail(rel_path: str, mime_type: str, data: bytes) -> str | None:
    """Generate a 200x200 JPEG thumbnail. Returns relative thumb path or None."""
    try:
        if mime_type and mime_type.startswith("image/"):
            return _thumb_from_image(data)
        elif mime_type == "application/pdf":
            return _thumb_from_pdf(data)
    except Exception:
        pass
    return None


def _thumb_from_image(data: bytes) -> str:
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    img.thumbnail(THUMB_SIZE)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    thumb_name = f"{uuid.uuid4().hex}.jpg"
    thumb_path = os.path.join(_get_thumbs_dir(), thumb_name)
    img.save(thumb_path, "JPEG", quality=80)
    return thumb_name


def _thumb_from_pdf(data: bytes) -> str:
    from pdf2image import convert_from_bytes

    images = convert_from_bytes(data, first_page=1, last_page=1, size=THUMB_SIZE)
    if not images:
        raise ValueError("No pages in PDF")
    img = images[0]
    if img.mode != "RGB":
        img = img.convert("RGB")
    thumb_name = f"{uuid.uuid4().hex}.jpg"
    thumb_path = os.path.join(_get_thumbs_dir(), thumb_name)
    img.save(thumb_path, "JPEG", quality=80)
    return thumb_name

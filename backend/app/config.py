import os


class Settings:
    USERNAME: str = os.getenv("OCTOVAULT_USERNAME", "admin")
    PASSWORD: str = os.getenv("OCTOVAULT_PASSWORD", "changeme")
    SECRET: str = os.getenv("OCTOVAULT_SECRET", "change-me-in-production")
    STORAGE: str = os.getenv("OCTOVAULT_STORAGE", "/data/files")
    DB: str = os.getenv("OCTOVAULT_DB", "/data/octovault.db")
    MAX_UPLOAD_MB: int = int(os.getenv("OCTOVAULT_MAX_UPLOAD_MB", "500"))
    PORT: int = int(os.getenv("OCTOVAULT_PORT", "5679"))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 24


settings = Settings()

import os


class Settings:
    USERNAME: str = os.getenv("CLAWMISSIONS_USERNAME", "admin")
    PASSWORD: str = os.getenv("CLAWMISSIONS_PASSWORD", "changeme")
    SECRET: str = os.getenv("CLAWMISSIONS_SECRET", "change-me-in-production")
    STORAGE: str = os.getenv("CLAWMISSIONS_STORAGE", "/data/files")
    DB: str = os.getenv("CLAWMISSIONS_DB", "/data/clawmissions.db")
    MAX_UPLOAD_MB: int = int(os.getenv("CLAWMISSIONS_MAX_UPLOAD_MB", "500"))
    PORT: int = int(os.getenv("CLAWMISSIONS_PORT", "5679"))
    LLM_URL: str = os.getenv("CLAWMISSIONS_LLM_URL", "http://100.125.85.113:8080")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 24


settings = Settings()

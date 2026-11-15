from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR.parent / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    pose_model_path: Path = Path("models/pose_landmarker_lite.task")
    landmark_visibility_threshold: float = Field(default=0.60, ge=0, le=1)
    frontend_origin: str = "http://localhost:5173,http://127.0.0.1:5173"
    deepseek_api_key: SecretStr | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-flash"
    deepseek_timeout_seconds: float = Field(default=30, gt=0, le=90)

    @property
    def model_asset(self) -> Path:
        return BACKEND_DIR / self.pose_model_path

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origin.split(",") if origin.strip()]

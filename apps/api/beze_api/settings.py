from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from the environment (prefix BEZE_). See .env.example."""

    model_config = SettingsConfigDict(env_prefix="BEZE_", env_file=".env", extra="ignore")

    # Which text provider drives content generation.
    #   anthropic: the Claude API (needs ANTHROPIC_API_KEY or an `ant auth login` profile)
    #   openai_compatible: any server speaking the OpenAI chat-completions protocol with tool
    #       calling, such as vLLM or Ollama running on your own GPUs
    #   fake: deterministic canned output for tests and offline development
    ai_provider: Literal["anthropic", "openai_compatible", "fake"] = "fake"
    ai_model: str = "claude-opus-5-5"
    ai_effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    ai_max_tokens: int = 16000
    ai_max_iterations: int = 8
    ai_fallbacks: bool = True
    openai_base_url: str = "http://localhost:8000/v1"
    openai_api_key: str = "not-needed"

    # Limits
    prompt_max_chars: int = 2000
    project_max_bytes: int = 2 * 1024 * 1024
    jobs_per_minute_per_ip: int = 10
    job_ttl_seconds: int = 3600

    # Pixabay API key for the editor's "Find art" (photos and illustrations for backdrops). Empty disables it.
    pixabay_api_key: str = ""

    # Where the generated operation schemas live (repo root /schemas by default).
    schemas_dir: Path = Path(__file__).resolve().parents[3] / "schemas"

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:4173", "http://localhost:4173"]


settings = Settings()

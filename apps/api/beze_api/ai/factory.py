from ..settings import Settings
from .anthropic_provider import AnthropicTextProvider
from .fake_provider import FakeTextProvider
from .openai_compatible_provider import OpenAICompatibleTextProvider
from .types import TextProvider


def make_text_provider(s: Settings) -> TextProvider:
    if s.ai_provider == "anthropic":
        return AnthropicTextProvider(model=s.ai_model, effort=s.ai_effort, fallbacks=s.ai_fallbacks)
    if s.ai_provider == "openai_compatible":
        return OpenAICompatibleTextProvider(base_url=s.openai_base_url, api_key=s.openai_api_key, model=s.ai_model)
    return FakeTextProvider()

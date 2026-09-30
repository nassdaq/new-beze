import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def fixture_project() -> dict:
    return json.loads((ROOT / "docs" / "examples" / "hello-aiko.project.json").read_text())

"""Local QALA application API: shared catalogue plus draft validation."""

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI

from qala_draft.api import create_draft_router
from qala_draft.core import Catalog, Measure

fixture: dict[str, Any] = json.loads(Path(__file__).with_name("catalog.json").read_text())
catalog = Catalog(
    measures=tuple(Measure(item["id"], item["direction"], item["cost"], item["scope"])
                   for item in fixture["measures"]),
    district_ids=frozenset(item["id"] for item in fixture["districts"]),
)
app = FastAPI(title="QALA")
app.include_router(create_draft_router(catalog))


@app.get("/api/catalog")
def get_catalog() -> dict[str, Any]:
    return fixture

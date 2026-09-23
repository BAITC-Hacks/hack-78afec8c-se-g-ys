import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from qala_draft.api import create_draft_router
from qala_draft.core import Catalog, Measure


@pytest.fixture
def catalog() -> Catalog:
    data = json.loads((Path(__file__).parents[1] / "examples/catalog.json").read_text())
    return Catalog(
        measures=tuple(Measure(item["id"], item["direction"], item["cost"], item["scope"])
                       for item in data["measures"]),
        district_ids=frozenset(item["id"] for item in data["districts"]),
    )


@pytest.fixture
def client(catalog: Catalog) -> Iterator[TestClient]:
    app = FastAPI()
    app.include_router(create_draft_router(catalog))
    with TestClient(app) as test_client:
        yield test_client

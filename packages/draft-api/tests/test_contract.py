from dataclasses import replace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from qala_draft.api import create_draft_router
from qala_draft.core import Catalog


@pytest.mark.parametrize("decision", [
    {"measure_id": 12},
    {"measure_id": "M1", "district_id": ["nura", "esil"]},
    {"measure_id": "M1", "district_id": True},
    {"measure_id": "M12", "cost": 0},
])
def test_transport_rejects_malformed_scope_and_client_costs(
    client: TestClient, decision: dict[str, object],
) -> None:
    response = client.post("/api/drafts/validate", json={"decisions": [decision]})
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"]


def test_catalogue_is_supplied_by_the_host_not_hardcoded(catalog: Catalog) -> None:
    host_catalog = replace(catalog, measures=tuple(
        replace(measure, cost=35) if measure.id == "M12" else measure
        for measure in catalog.measures
    ))
    app = FastAPI()
    app.include_router(create_draft_router(host_catalog))
    with TestClient(app) as client:
        result = client.post("/api/drafts/validate", json={"decisions": [{"measure_id": "M12"}]}).json()
    assert (result["spent"], result["remaining"]) == (35, 65)


def test_complete_draft_is_order_independent_and_has_only_draft_fields(client: TestClient) -> None:
    decisions = [
        {"measure_id": "M9", "district_id": "nura"},
        {"measure_id": "M8", "district_id": "nura"},
        {"measure_id": "M10", "district_id": "nura"},
        {"measure_id": "M11", "district_id": "nura"},
        {"measure_id": "M12"},
    ]
    result = client.post("/api/drafts/validate", json={"decisions": decisions}).json()
    reordered = client.post("/api/drafts/validate", json={"decisions": decisions[::-1]}).json()
    assert result == reordered == {
        "valid": True, "complete": True, "decision_count": 5, "spent": 66,
        "remaining": 34, "errors": [], "warnings": [],
    }


def test_exact_lower_bound_does_not_warn_or_claim_completion(client: TestClient) -> None:
    result = client.post("/api/drafts/validate", json={"decisions": [
        {"measure_id": "M3", "district_id": "nura"},
        {"measure_id": "M13", "district_id": "almaty"},
        {"measure_id": "M2"},
    ]}).json()
    assert (result["valid"], result["complete"], result["spent"], result["remaining"]) == (True, False, 80, 20)
    assert result["warnings"] == []

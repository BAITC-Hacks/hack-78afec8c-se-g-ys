import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from qala_draft.api import create_draft_router
from qala_draft.core import Catalog


def test_empty_draft_is_editable_without_revealing_results() -> None:
    app = FastAPI()
    app.include_router(create_draft_router(Catalog(measures=(), district_ids=frozenset())))
    with TestClient(app) as client:
        response = client.post("/api/drafts/validate", json={"decisions": []})

    assert response.status_code == 200
    assert response.json() == {
        "valid": True,
        "complete": False,
        "decision_count": 0,
        "spent": 0,
        "remaining": 100,
        "errors": [],
        "warnings": [],
    }


def test_adding_replacing_and_removing_recalculates_the_draft(client: TestClient) -> None:
    decisions = [{"measure_id": "M1", "district_id": "nura"}]
    added = client.post("/api/drafts/validate", json={"decisions": decisions}).json()
    assert (added["valid"], added["decision_count"], added["spent"], added["remaining"]) == (True, 1, 18, 82)

    decisions[0] = {"measure_id": "M3", "district_id": "almaty"}
    replaced = client.post("/api/drafts/validate", json={"decisions": decisions}).json()
    assert (replaced["spent"], replaced["remaining"], replaced["complete"]) == (30, 70, False)

    removed = client.post("/api/drafts/validate", json={"decisions": []}).json()
    assert (removed["decision_count"], removed["spent"], removed["remaining"]) == (0, 0, 100)


@pytest.mark.parametrize(("measure_id", "district_id", "code"), [
    ("missing", None, "unknown_measure"),
    ("M1", None, "district_required"),
    ("M1", "missing", "unknown_district"),
    ("M2", "nura", "district_not_allowed"),
])
def test_scope_violations_have_localizable_reasons(
    client: TestClient, measure_id: str, district_id: str | None, code: str,
) -> None:
    response = client.post("/api/drafts/validate", json={"decisions": [
        {"measure_id": measure_id, "district_id": district_id},
    ]})
    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert response.json()["errors"] == [{"code": code, "decision_indexes": [0]}]
    assert "score" not in response.json()


def test_budget_100_is_allowed_but_overspending_is_rejected(client: TestClient) -> None:
    decisions = [
        {"measure_id": "M3", "district_id": "nura"},
        {"measure_id": "M5", "district_id": "saryarka"},
        {"measure_id": "M9", "district_id": "nura"},
        {"measure_id": "M4", "district_id": "almaty"},
        {"measure_id": "M8", "district_id": "nura"},
    ]
    result = client.post("/api/drafts/validate", json={"decisions": decisions}).json()
    assert (result["valid"], result["complete"], result["spent"], result["remaining"]) == (True, True, 100, 0)

    decisions[-1] = {"measure_id": "M7", "district_id": "nura"}
    result = client.post("/api/drafts/validate", json={"decisions": decisions}).json()
    assert result["valid"] is False
    assert result["complete"] is False
    assert result["errors"] == [{"code": "budget_exceeded", "decision_indexes": []}]


@pytest.mark.parametrize(("choices", "code", "indexes"), [
    ([("M9", "nura"), ("M9", "almaty")], "duplicate_measure", [0, 1]),
    ([("M7", "nura"), ("M8", "nura"), ("M9", "nura")], "direction_limit", [0, 1, 2]),
    ([("M9", "nura"), ("M11", "nura"), ("M10", "nura"), ("M12", None),
      ("M4", "almaty"), ("M14", None)], "too_many_decisions", []),
])
def test_draft_selection_limits_are_rejected(
    client: TestClient, choices: list[tuple[str, str | None]], code: str, indexes: list[int],
) -> None:
    response = client.post("/api/drafts/validate", json={"decisions": [
        {"measure_id": measure, "district_id": district} for measure, district in choices
    ]})
    assert response.json()["valid"] is False
    assert response.json()["errors"] == [{"code": code, "decision_indexes": indexes}]


@pytest.mark.parametrize(("first", "second", "district", "code"), [
    ("M1", "M3", "nura", "incompatible_measures"),
    ("M3", "M1", "almaty", "incompatible_measures"),
    ("M4", "M7", "nura", "incompatible_district"),
    ("M7", "M4", "nura", "incompatible_district"),
    ("M5", "M13", "nura", "incompatible_district"),
    ("M13", "M5", "nura", "incompatible_district"),
    ("M4", "M7", "almaty", None),
    ("M5", "M13", "almaty", None),
])
def test_incompatibilities_obey_geographic_scope(
    client: TestClient, first: str, second: str, district: str, code: str | None,
) -> None:
    result = client.post("/api/drafts/validate", json={"decisions": [
        {"measure_id": first, "district_id": "nura"},
        {"measure_id": second, "district_id": district},
    ]}).json()
    assert result["valid"] is (code is None)
    assert result["errors"] == ([] if code is None else [{"code": code, "decision_indexes": [0, 1]}])


def test_cost_83_draft_warns_but_remains_editable(client: TestClient) -> None:
    choices = [
        {"measure_id": "M3", "district_id": "nura"},
        {"measure_id": "M5", "district_id": "saryarka"},
        {"measure_id": "M13", "district_id": "almaty"},
    ]
    result = client.post("/api/drafts/validate", json={"decisions": choices}).json()
    assert (result["valid"], result["complete"], result["spent"], result["remaining"]) == (True, False, 83, 17)
    assert result["errors"] == []
    assert result["warnings"] == [{"code": "insufficient_completion_budget", "decision_indexes": []}]

    choices.pop()
    edited = client.post("/api/drafts/validate", json={"decisions": choices}).json()
    assert (edited["valid"], edited["spent"], edited["warnings"]) == (True, 55, [])

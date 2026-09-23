"""Pure draft rules. No HTTP, persistence, scoring, or AI dependencies."""

from dataclasses import dataclass
from itertools import combinations
from typing import Literal


@dataclass(frozen=True)
class Measure:
    id: str
    direction: str
    cost: int
    scope: Literal["district", "city"]


@dataclass(frozen=True)
class Catalog:
    measures: tuple[Measure, ...]
    district_ids: frozenset[str]


@dataclass(frozen=True)
class Decision:
    measure_id: str
    district_id: str | None = None


@dataclass(frozen=True)
class Problem:
    code: str
    decision_indexes: tuple[int, ...] = ()


@dataclass(frozen=True)
class DraftValidation:
    valid: bool
    complete: bool
    decision_count: int
    spent: int
    remaining: int
    errors: tuple[Problem, ...] = ()
    warnings: tuple[Problem, ...] = ()


def validate_draft(catalog: Catalog, decisions: tuple[Decision, ...]) -> DraftValidation:
    measures = {measure.id: measure for measure in catalog.measures}
    errors: list[Problem] = []
    for index, decision in enumerate(decisions):
        measure = measures.get(decision.measure_id)
        if measure is None:
            errors.append(Problem("unknown_measure", (index,)))
        elif measure.scope == "city":
            if decision.district_id is not None:
                errors.append(Problem("district_not_allowed", (index,)))
        elif decision.district_id is None:
            errors.append(Problem("district_required", (index,)))
        elif decision.district_id not in catalog.district_ids:
            errors.append(Problem("unknown_district", (index,)))
    spent = sum(measures[item.measure_id].cost for item in decisions if item.measure_id in measures)
    if spent > 100:
        errors.append(Problem("budget_exceeded"))
    if len(decisions) > 5:
        errors.append(Problem("too_many_decisions"))
    selected: dict[str, list[int]] = {}
    directions: dict[str, list[int]] = {}
    for index, decision in enumerate(decisions):
        selected.setdefault(decision.measure_id, []).append(index)
        if decision.measure_id in measures:
            directions.setdefault(measures[decision.measure_id].direction, []).append(index)
    errors.extend(Problem("duplicate_measure", tuple(indexes))
                  for indexes in selected.values() if len(indexes) > 1)
    errors.extend(Problem("direction_limit", tuple(indexes))
                  for indexes in directions.values() if len(indexes) > 2)
    for (left_index, left), (right_index, right) in combinations(enumerate(decisions), 2):
        pair = {left.measure_id, right.measure_id}
        indexes_pair = (left_index, right_index)
        if pair == {"M1", "M3"}:
            errors.append(Problem("incompatible_measures", indexes_pair))
        elif (pair in ({"M4", "M7"}, {"M5", "M13"})
              and left.district_id in catalog.district_ids
              and left.district_id == right.district_id):
            errors.append(Problem("incompatible_district", indexes_pair))
    warnings: tuple[Problem, ...] = ()
    if not errors and len(decisions) < 5:
        cheapest = sorted(measure.cost for measure in catalog.measures if measure.id not in selected)
        if sum(cheapest[:5 - len(decisions)]) > 100 - spent:
            warnings = (Problem("insufficient_completion_budget"),)
    return DraftValidation(not errors, not errors and len(decisions) == 5,
                           len(decisions), spent, 100 - spent, tuple(errors), warnings)

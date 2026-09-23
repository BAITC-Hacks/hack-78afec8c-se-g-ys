# QALA draft API — issues #2 and #3

The FastAPI application serves the shared city catalogue and the [draft editing and validation](https://github.com/BAITC-Hacks/hack-78afec8c-se-g-ys/issues/3) route. The pure Python rules receive the trusted server-owned catalogue when the application starts.

## Setup and verification

Requires Python 3.12+ and `uv`. From this directory:

```sh
uv sync --locked
uv run pytest tests/test_draft_api.py -q  # focused domain/API checks
uv run pytest                         # full Python suite
uv run mypy                           # source, tests, demo
```

Keep four-space Python indentation, descriptive `test_...` names, and tests at the public HTTP boundary.
`uv.lock` pins the resolved dependencies. There is no numerical coverage threshold.

## Host contract

Install this local package in the host backend environment and mount its router:

```python
from qala_draft.api import create_draft_router
from qala_draft.core import Catalog, Measure

# Map the host's server-owned catalogue to these fields.
catalog = Catalog(
    measures=tuple(
        Measure(item.id, item.direction, item.cost, item.scope)
        for item in server_measures
    ),
    district_ids=frozenset(item.id for item in server_districts),
)
app.include_router(create_draft_router(catalog))
```

`Measure.scope` is `"district"` or `"city"`; `direction` is a stable category ID;
`cost` is the organizer's integer cost. The catalogue must contain the official
14 unique measure IDs (`M1`–`M14`) and five district IDs. The district IDs may use
the host's naming convention, but must match those sent to the editor. Never
construct this catalogue from a browser request. Budget 100 and the five-decision
limit are organizer rules, not client configuration.

The reusable pure function is `validate_draft(catalog, tuple_of_decisions)`.
It has no HTTP, AI, persistence, or scoring dependency.

## HTTP contract

`POST /api/drafts/validate` accepts the entire candidate draft:

```json
{"decisions":[{"measure_id":"M3","district_id":"nura"},{"measure_id":"M12"}]}
```

The response is HTTP 200 for a well-formed validation request, including rejected drafts:

```json
{"valid":true,"complete":false,"decision_count":2,"spent":44,"remaining":56,"errors":[],"warnings":[]}
```

The endpoint is stateless. A client replaces its current draft only when `valid`
is true; rejected edits leave the previous draft intact. `complete` means exactly
five valid decisions, **not** that a scenario has been accepted. Incomplete drafts
are valid and editable. Score, final indicators, recommendations, and acceptance
are outside this package. Counts and totals for invalid drafts are diagnostic;
unknown measures contribute no cost and always cause rejection.

Errors and warnings contain `code` and zero-based `decision_indexes` referring to
the submitted candidate. Global problems use an empty index list.

| Code | Meaning |
| --- | --- |
| `unknown_measure` | Measure ID is not in the catalogue |
| `district_required` | A district measure needs one district |
| `unknown_district` | District ID is not in the catalogue |
| `district_not_allowed` | Citywide measures must omit the district or send null |
| `budget_exceeded` | Cost exceeds 100; exactly 100 is allowed |
| `too_many_decisions` | More than five choices |
| `duplicate_measure` | Same measure selected more than once, even in different districts |
| `direction_limit` | More than two choices from a direction |
| `incompatible_measures` | M1/M3 conflict everywhere |
| `incompatible_district` | M4/M7 or M5/M13 conflict in the same district |
| `insufficient_completion_budget` | Warning: the cheapest unselected measures cannot fit the remaining budget |

With five decisions and at most two per direction, at least three directions are
automatically represented; one choice per direction is not required. The warning
is a lower bound, not a solver for compatible completions. The PRD example
M3/Нура + M5/Сарыарка + M13/Алматы costs 83, leaves 17, and remains editable with
a warning because the two cheapest remaining measures cost 20.

Malformed JSON shapes, extra fields, multiple districts, and wrong scalar types
produce HTTP 422 with FastAPI's machine-readable `detail` errors. Clients cannot
supply costs, a budget, or calculated scores.

## Local API

```sh
uv run uvicorn examples.app:app --host 127.0.0.1 --port 8013
```

Start the [editor](../draft-ui/README.md) in another terminal, or use `npm start`
from the repository root to launch both services. No API keys or environment
variables are needed. `examples/catalog.json` is the shared local source for the
catalogue route and the validator; browser-supplied values never configure it.

const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateScenario } = require('../src/simulation');
const { createAttemptHistory } = require('../public/history');

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

const participantDecisions = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
];

const secondDecisions = [
  { measureId: 'M1', districtId: 'nura' },
  { measureId: 'M2', districtId: null },
  { measureId: 'M4', districtId: 'almaty' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M14', districtId: null },
];

test('a completed global comparison is saved with its accepted attempt and survives history reload without reordering attempts', () => {
  const storage = new MemoryStorage();
  const history = createAttemptHistory(storage, { id: (() => {
    let number = 0;
    return () => `attempt-${++number}`;
  })() });
  const first = history.append(calculateScenario(participantDecisions));
  const second = history.append(calculateScenario(secondDecisions));
  const comparison = {
    kind: 'global_optimum',
    catalogVersion: 'qala-catalog-v1',
    modelVersion: 'qala-score-q8-v1',
    participant: { score: first.result.score, cost: first.result.cost },
    global: { decisions: second.decisions, score: second.result.score, cost: second.result.cost },
    delta: second.result.score - first.result.score,
  };

  const saved = history.saveGlobalComparison(first.id, comparison);
  comparison.global.decisions[0].measureId = 'M9';

  const afterReload = createAttemptHistory(storage).list();
  assert.equal(saved.id, first.id);
  assert.deepEqual(afterReload.map((attempt) => attempt.id), [first.id, second.id]);
  assert.equal(afterReload[0].globalComparison.kind, 'global_optimum');
  assert.equal(afterReload[0].globalComparison.global.decisions[0].measureId, 'M1');
  assert.equal(afterReload[1].globalComparison, undefined);
});

test('a saved global comparison is unavailable when its catalog or model version no longer matches', () => {
  const storage = new MemoryStorage();
  const history = createAttemptHistory(storage, { id: () => 'attempt-1' });
  const attempt = history.append(calculateScenario(participantDecisions));
  const comparison = {
    kind: 'global_optimum',
    catalogVersion: 'qala-catalog-v1',
    modelVersion: 'qala-score-q8-v1',
    participant: { score: attempt.result.score, cost: attempt.result.cost },
    global: { decisions: secondDecisions, score: 60, cost: 91 },
    delta: 1,
  };
  history.saveGlobalComparison(attempt.id, comparison);

  assert.deepEqual(history.getGlobalComparison(attempt.id, {
    catalogVersion: 'qala-catalog-v1', modelVersion: 'qala-score-q8-v1',
  }), comparison);
  assert.equal(history.getGlobalComparison(attempt.id, {
    catalogVersion: 'qala-catalog-v2', modelVersion: 'qala-score-q8-v1',
  }), null);
  assert.equal(history.getGlobalComparison(attempt.id, {
    catalogVersion: 'qala-catalog-v1', modelVersion: 'qala-score-q8-v2',
  }), null);
});

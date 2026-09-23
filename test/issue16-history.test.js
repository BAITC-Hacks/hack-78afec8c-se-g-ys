const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateScenario } = require('../src/simulation');
const { createServer } = require('../server');
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

test('a version-mismatched What If request preserves its accepted attempt and the bilingual client offers a retryable editable copy', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const accepted = await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: 'attempt-version-safe', decisions: participantDecisions, locale: 'ru' }),
    });
    const original = await accepted.json();
    assert.equal(accepted.status, 200);

    const stale = await fetch(`${baseUrl}/api/attempts/attempt-version-safe/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'ru', catalogVersion: 'obsolete-catalog' }),
    });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error, 'comparison_version_mismatch');

    const replay = await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: 'attempt-version-safe', decisions: participantDecisions, locale: 'ru' }),
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).result.score, original.result.score);

    const [ruPage, kkPage, client] = await Promise.all([
      fetch(`${baseUrl}/`).then((response) => response.text()),
      fetch(`${baseUrl}/?locale=kk`).then((response) => response.text()),
      fetch(`${baseUrl}/client.js`).then((response) => response.text()),
    ]);
    assert.match(ruPage, /qalaGlobalComparisonVersions/);
    assert.match(kkPage, /What If жаһандық салыстыруы/);
    assert.match(client, /data-copy-global-comparison/);
    assert.match(client, /getGlobalComparison/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('the explicit global comparison response can be stored with its attempt and copied as an unaccepted draft source', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: 'attempt-revisit', decisions: participantDecisions, locale: 'kk' }),
    });
    const response = await fetch(`${baseUrl}/api/attempts/attempt-revisit/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'kk', catalogVersion: 'qala-catalog-v1', modelVersion: 'qala-score-q8-v1' }),
    });
    const { comparison } = await response.json();
    assert.equal(response.status, 200);
    assert.equal(comparison.global.decisions.length, 5);
    assert.equal(comparison.global.decisionDetails.length, 5);
    assert.equal(typeof comparison.global.decisionDetails[0].direction, 'string');
    assert.ok(comparison.global.score >= comparison.participant.score);

    const storage = new MemoryStorage();
    const history = createAttemptHistory(storage, { id: () => 'attempt-revisit' });
    const original = history.append(calculateScenario(participantDecisions));
    history.saveGlobalComparison(original.id, comparison);
    const reopened = createAttemptHistory(storage).get(original.id);
    const copiedDraft = reopened.globalComparison.global.decisions.map((decision) => ({ ...decision }));

    assert.deepEqual(reopened.decisions, participantDecisions);
    assert.deepEqual(copiedDraft, comparison.global.decisions);
    assert.equal(reopened.result.score, original.result.score);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

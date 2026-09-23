const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateImpactBreakdown, calculateScenario } = require('../src/simulation');
const { createServer } = require('../server');
const { createAttemptHistory } = require('../public/history');

const officialDecisions = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
];

test('Impact Breakdown reconciles five deterministic contributions to the accepted scenario result', () => {
  const accepted = calculateScenario(officialDecisions);
  const breakdown = calculateImpactBreakdown(accepted);

  assert.equal(breakdown.status, 'ready');
  assert.equal(breakdown.contributions.length, 5);
  assert.equal(breakdown.subsetUtilities.length, 32);
  assert.equal(breakdown.fullUtility, accepted.result.score);
  assert.equal(breakdown.baselineUtility, accepted.result.baseScore);
  assert.ok(Math.abs(breakdown.reconciliation.residual) < 1e-12);
  assert.equal(
    breakdown.contributions.reduce((sum, contribution) => sum + contribution.value, 0),
    breakdown.fullUtility - breakdown.baselineUtility,
  );
});

test('Impact Breakdown is invariant to the order in which an accepted scenario is supplied', () => {
  const forward = calculateImpactBreakdown(calculateScenario(officialDecisions));
  const reverse = calculateImpactBreakdown(calculateScenario([...officialDecisions].reverse()));

  assert.deepEqual(reverse, forward);
});

test('a saved accepted attempt exposes a localized breakdown but never exposes partial subset utilities', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const post = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    await post('/api/scenarios/accept', { attemptId: 'impact-1', decisions: officialDecisions, locale: 'ru' });
    const response = await post('/api/attempts/impact-1/impact-breakdown', { locale: 'kk' });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.status, 'ready');
    assert.equal(payload.locale, 'kk');
    assert.equal(payload.breakdown.contributions.length, 5);
    assert.match(payload.breakdown.interpretation, /үлес/i);
    assert.deepEqual(payload.breakdown.evidenceFactIds, ['scenario.score', 'scenario.score_delta']);
    assert.equal('subsetUtilities' in payload.breakdown, false);
    assert.equal(JSON.stringify(payload).includes('mask'), false);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('a successful breakdown persists with only its attempt and becomes unavailable on a model-version mismatch', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const history = createAttemptHistory(storage, { id: () => 'impact-history' });
  const accepted = calculateScenario(officialDecisions);
  const attempt = history.append(accepted);
  const breakdown = calculateImpactBreakdown(accepted);

  history.saveImpactBreakdown(attempt.id, breakdown);
  const reloaded = createAttemptHistory(storage);

  assert.equal(reloaded.get(attempt.id).result.score, accepted.result.score);
  assert.equal('subsetUtilities' in reloaded.get(attempt.id).impactBreakdown, false);
  assert.equal(reloaded.getImpactBreakdown(attempt.id, { catalogVersion: breakdown.catalogVersion, modelVersion: breakdown.modelVersion }).fullUtility, accepted.result.score);
  assert.equal(reloaded.getImpactBreakdown(attempt.id, { catalogVersion: breakdown.catalogVersion, modelVersion: 'qala-score-q8-v2' }), null);
});

test('the official M10/M12 synergy is allocated across its Shapley contributions', () => {
  const breakdown = calculateImpactBreakdown(calculateScenario(officialDecisions));
  const canonical = breakdown.contributions.map((contribution) => contribution.decision);
  const utility = (ids) => {
    const mask = canonical.reduce((total, decision, index) => total | (ids.includes(decision.measureId) ? 1 << index : 0), 0);
    return breakdown.subsetUtilities.find((item) => item.mask === mask).utility;
  };

  const interaction = utility(['M10', 'M12']) - utility(['M10']) - utility(['M12']) + utility([]);

  assert.ok(interaction > 0);
  assert.ok(breakdown.contributions.find((item) => item.decision.measureId === 'M10').value > 0);
  assert.ok(breakdown.contributions.find((item) => item.decision.measureId === 'M12').value > 0);
});

test('an unavailable calculation does not alter the accepted attempt and may be retried', async () => {
  let calls = 0;
  const server = createServer({ impactBreakdownCalculator: () => {
    calls += 1;
    throw new Error('calculation unavailable');
  } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const post = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    const accepted = await (await post('/api/scenarios/accept', { attemptId: 'impact-retry', decisions: officialDecisions })).json();
    const first = await (await post('/api/attempts/impact-retry/impact-breakdown', {})).json();
    const retry = await (await post('/api/attempts/impact-retry/impact-breakdown', {})).json();

    assert.equal(first.status, 'unavailable');
    assert.equal(retry.status, 'unavailable');
    assert.equal(calls, 2);
    assert.equal(accepted.result.score, calculateScenario(officialDecisions).result.score);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('the participant client provides an accessible Impact Breakdown and retry path', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const client = await (await fetch(`http://127.0.0.1:${port}/client.js`)).text();

    assert.match(client, /impact-breakdown/);
    assert.match(client, /aria-labelledby="impact-breakdown-title"/);
    assert.match(client, /retry-impact-breakdown/);
    assert.match(client, /saveImpactBreakdown/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../server');
const { calculateScenario, isBetterGlobalCandidate } = require('../src/simulation');
const { createAttemptHistory } = require('../public/history');

const participantDecisions = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
];

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('What If is explicit and compares an accepted attempt with a directly verifiable global representative', async () => {
  await withServer(async (baseUrl) => {
    const unavailable = await fetch(`${baseUrl}/api/attempts/missing/what-if`, { method: 'POST' });
    assert.equal(unavailable.status, 404);

    const accepted = await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: 'attempt-what-if', decisions: participantDecisions, locale: 'ru' }),
    });
    assert.equal(accepted.status, 200);

    const response = await fetch(`${baseUrl}/api/attempts/attempt-what-if/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'ru' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.attemptId, 'attempt-what-if');
    assert.equal(payload.comparison.kind, 'global_optimum');
    assert.equal(payload.comparison.global.decisions.length, 5);
    assert.equal(payload.comparison.global.decisionDetails.length, 5);
    assert.equal(typeof payload.comparison.global.decisionDetails[0].direction, 'string');
    assert.equal(typeof payload.comparison.global.decisionDetails[0].cost, 'number');
    assert.ok(payload.comparison.global.score >= payload.comparison.participant.score);
    assert.equal(payload.comparison.delta, payload.comparison.global.score - payload.comparison.participant.score);
    assert.equal(payload.comparison.catalogVersion, 'qala-catalog-v1');
    assert.equal(payload.comparison.modelVersion, 'qala-score-q8-v1');
    assert.equal(payload.comparison.global.validScenarioCount, 694395);

    const direct = calculateScenario(payload.comparison.global.decisions);
    assert.equal(direct.accepted, true);
    assert.equal(direct.result.score, payload.comparison.global.score);
    assert.equal(direct.result.cost, payload.comparison.global.cost);

    const stale = await fetch(`${baseUrl}/api/attempts/attempt-what-if/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catalogVersion: 'old-catalog' }),
    });
    assert.equal(stale.status, 409);

    const staleModel = await fetch(`${baseUrl}/api/attempts/attempt-what-if/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelVersion: 'old-model' }),
    });
    assert.equal(staleModel.status, 409);
  });
});

test('the result view keeps global What If separate from point replacement in both languages', async () => {
  await withServer(async (baseUrl) => {
    const [russianPage, kazakhPage, client] = await Promise.all([
      fetch(`${baseUrl}/`).then((response) => response.text()),
      fetch(`${baseUrl}/?locale=kk`).then((response) => response.text()),
      fetch(`${baseUrl}/client.js`).then((response) => response.text()),
    ]);

    assert.match(russianPage, /Глобальное сравнение What If/);
    assert.match(kazakhPage, /What If жаһандық салыстыруы/);
    assert.match(client, /data-reveal-global-comparison/);
    assert.match(client, /api\/attempts\/.*what-if/);
    assert.match(client, /globalComparisonMarkup/);
  });
});

test('global tie selection prefers lower cost, then canonical decision order without rounding', () => {
  const candidate = (score, cost, measureId) => ({
    score,
    validation: { cost },
    decisions: [
      { measureId, districtId: 'almaty' },
      { measureId: 'M4', districtId: 'esil' },
      { measureId: 'M7', districtId: 'nura' },
      { measureId: 'M10', districtId: 'nura' },
      { measureId: 'M12', districtId: null },
    ],
  });

  assert.equal(isBetterGlobalCandidate(candidate(60.000002, 90, 'M2'), candidate(60.000001, 80, 'M1')), true);
  assert.equal(isBetterGlobalCandidate(candidate(60, 89, 'M2'), candidate(60, 90, 'M1')), true);
  assert.equal(isBetterGlobalCandidate(candidate(60, 90, 'M1'), candidate(60, 90, 'M2')), true);
});

test('a global comparison is saved with the accepted attempt', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const history = createAttemptHistory(storage, { id: () => 'attempt-1' });
  history.append(calculateScenario(participantDecisions));
  history.saveGlobalComparison('attempt-1', { kind: 'global_optimum', catalogVersion: 'qala-catalog-v1' });

  const restored = createAttemptHistory(storage).get('attempt-1');
  assert.equal(restored.globalComparison.catalogVersion, 'qala-catalog-v1');
});

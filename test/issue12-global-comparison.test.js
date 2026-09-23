const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateScenario, findGlobalMaximum, validateScenario } = require('../src/simulation');
const { createServer } = require('../server');
const { createAttemptHistory } = require('../public/history');
const { catalogPayload } = require('../src/data');
const { renderPage } = require('../src/view');
const fs = require('node:fs');

const acceptedScenario = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
];

test('global comparison returns a valid, reproducible best scenario without changing the accepted one', () => {
  const accepted = calculateScenario(acceptedScenario);
  const comparison = findGlobalMaximum(accepted);

  assert.equal(accepted.accepted, true);
  assert.equal(validateScenario(comparison.decisions).valid, true);
  assert.equal(calculateScenario(comparison.decisions).result.score, comparison.score);
  assert.equal(comparison.decisions.length, 5);
  assert.equal(comparison.candidateCount, 694395);
  assert.equal(comparison.delta, comparison.score - accepted.result.score);
  assert.match(comparison.modelVersion, /^qala-/);
  assert.deepEqual(accepted.decisions, acceptedScenario);
});

test('global comparison is explicitly available only for an accepted server attempt', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const unavailable = await fetch(`${baseUrl}/api/attempts/not-accepted/global-comparison`, { method: 'POST' });
    assert.equal(unavailable.status, 404);

    const accepted = await (await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId: 'accepted-1', decisions: acceptedScenario }),
    })).json();
    const response = await fetch(`${baseUrl}/api/attempts/accepted-1/global-comparison`, { method: 'POST' });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.acceptedScenarioScore, accepted.result.score);
    assert.equal(validateScenario(payload.comparison.decisions).valid, true);
    assert.equal(payload.comparison.delta, payload.comparison.score - accepted.result.score);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('a successful global comparison is retained with its accepted attempt', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const history = createAttemptHistory(storage, { id: () => 'attempt-1' });
  const attempt = history.append(calculateScenario(acceptedScenario));
  const comparison = { score: 57.2, delta: 0.6, decisions: acceptedScenario, modelVersion: 'qala-test' };

  history.saveGlobalComparison(attempt.id, comparison);

  assert.deepEqual(createAttemptHistory(storage).get(attempt.id).globalComparison, comparison);
});

test('the visual explorer has an SVG map, an accessible text alternative, and an eight-quarter calendar', () => {
  const page = renderPage(catalogPayload('ru'));
  const client = fs.readFileSync(require.resolve('../public/client.js'), 'utf8');

  assert.match(page, /id="scenario-map"/);
  assert.match(client, /<svg class="district-map"/);
  assert.match(client, /data-map-district/);
  assert.match(client, /aria-pressed/);
  assert.match(client, /lag-calendar/);
  assert.match(client, /Q\$\{index \+ 1\}/);
  assert.match(renderPage(catalogPayload('kk')), /Сценарий картасы/);
});

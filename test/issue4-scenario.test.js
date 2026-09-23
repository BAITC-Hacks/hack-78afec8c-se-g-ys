const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../server');

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const officialDecisions = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
];

test('acceptance control starts disabled until a valid five-decision draft exists', async () => {
  await withServer(async (baseUrl) => {
    const page = await (await fetch(`${baseUrl}/`)).text();
    const client = await (await fetch(`${baseUrl}/client.js`)).text();

    assert.match(page, /id="accept-scenario"[^>]*disabled/);
    assert.match(page, /id="result-panel" hidden/);
    assert.match(client, /api\/scenarios\/accept/);
  });
});

test('acceptance returns the official deterministic Q8 result', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions: officialDecisions }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.accepted, true);
    assert.equal(payload.result.cost, 95);
    assert.equal(payload.result.remainingBudget, 5);
    assert.ok(Math.abs(payload.result.score - 56.54307) < 0.000001);
    assert.ok(Math.abs(payload.result.scoreDelta - 3.98539) < 0.000001);
    assert.equal(payload.result.horizonQuarters, 8);
    assert.equal(payload.result.criticalCount, 0);
    assert.ok(Math.abs(payload.result.score - (0.7 * payload.result.weightedAverage + 0.3 * payload.result.weakestDistrict.score - payload.result.criticalCount)) < 0.0000001);
    assert.equal(payload.result.districts.length, 5);
    assert.equal(payload.result.synergies.length, 1);
  });
});

test('invalid scenarios are rejected with machine-readable reasons and no result', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions: [
        { measureId: 'M1', districtId: 'nura' },
        { measureId: 'M1', districtId: 'almaty' },
        { measureId: 'M2', districtId: 'nura' },
        { measureId: 'M3', districtId: 'nura' },
      ] }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.accepted, false);
    assert.equal('result' in payload, false);
    assert.ok(payload.errors.some((item) => item.code === 'exactly_five_decisions_required'));
    assert.ok(payload.errors.some((item) => item.code === 'duplicate_measure'));
    assert.ok(payload.errors.some((item) => item.code === 'incompatible_measures'));
    assert.ok(payload.errors.some((item) => item.code === 'direction_limit_exceeded'));
  });
});

test('Q8 calculation is independent of decision order and applies geography and lag', async () => {
  await withServer(async (baseUrl) => {
    const post = (decisions) => fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions }),
    }).then((response) => response.json());
    const forward = await post(officialDecisions);
    const reverse = await post([...officialDecisions].reverse());

    assert.deepEqual(reverse.result, forward.result);
    const nura = forward.result.districts.find((district) => district.id === 'nura');
    const esil = forward.result.districts.find((district) => district.id === 'esil');
    assert.equal(nura.changes.B1, 12.5);
    assert.equal(esil.changes.B1, 0);
    assert.equal(nura.changes.C2, 4.375);
    assert.equal(esil.changes.C2, 4.375);
  });
});

test('accepted scenario includes a valid positive single-replacement recommendation', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions: officialDecisions }),
    });
    const payload = await response.json();
    const recommendation = payload.result.recommendation;

    assert.equal(response.status, 200);
    assert.equal(recommendation.found, true);
    assert.ok(recommendation.scoreDelta > 0);
    assert.equal(recommendation.decisions.length, 5);
    assert.deepEqual(recommendation.replacedDecision, { measureId: 'M5', districtId: 'saryarka' });
    assert.deepEqual(recommendation.replacementDecision, { measureId: 'M3', districtId: 'nura' });
    assert.equal(recommendation.result.accepted, true);
    assert.ok(recommendation.result.score > payload.result.score);
    assert.ok(recommendation.impacts.some((impact) => impact.gains.length > 0));
  });
});

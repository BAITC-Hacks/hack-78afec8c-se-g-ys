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

test('accepted scenario immediately returns calculator facts and a Russian basic analysis with evidence', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions: officialDecisions }),
    });
    const payload = await response.json();
    const { facts, basicAnalysis } = payload.result;

    assert.equal(response.status, 200);
    assert.equal(basicAnalysis.kind, 'basic');
    assert.match(basicAnalysis.label, /Базовый разбор/);
    assert.deepEqual(basicAnalysis.sections.map((section) => section.id), ['summary', 'strengths', 'problems', 'replacement']);
    assert.ok(facts.some((fact) => fact.id === 'scenario.score' && fact.value === payload.result.score));
    assert.ok(facts.some((fact) => fact.id === 'alternative.score' && fact.value === payload.result.recommendation.score));
    assert.ok(facts.every((fact) => ['scenario', 'alternative'].includes(fact.scope)));

    const factIds = new Set(facts.map((fact) => fact.id));
    for (const section of basicAnalysis.sections) {
      assert.ok(section.conclusions.length > 0);
      for (const conclusion of section.conclusions) {
        assert.ok(conclusion.factIds.length > 0);
        assert.ok(conclusion.factIds.every((id) => factIds.has(id)));
      }
    }
  });
});

test('accepted result renders the labelled basic analysis with expandable calculation evidence', async () => {
  await withServer(async (baseUrl) => {
    const client = await (await fetch(`${baseUrl}/client.js`)).text();

    assert.match(client, /analysis\.label/);
    assert.match(client, /<details[^>]*class="analysis-evidence"/);
    assert.match(client, /data-fact-id=/);
    assert.match(client, /result\.basicAnalysis/);
  });
});

test('client saves the accepted calculated result together with the basic analysis', async () => {
  await withServer(async (baseUrl) => {
    const client = await (await fetch(`${baseUrl}/client.js`)).text();

    assert.match(client, /localStorage\.setItem/);
    assert.match(client, /basicAnalysis/);
  });
});

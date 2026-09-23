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

test('Kazakh presents the same catalogue and accepted scenario without changing its model', async () => {
  await withServer(async (baseUrl) => {
    const ruCatalog = await (await fetch(`${baseUrl}/api/catalog`)).json();
    const kkCatalog = await (await fetch(`${baseUrl}/api/catalog?locale=kk`)).json();
    const kkPage = await (await fetch(`${baseUrl}/?locale=kk`)).text();
    const ruResult = await (await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions: officialDecisions, locale: 'ru' }),
    })).json();
    const kkResult = await (await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions: officialDecisions, locale: 'kk' }),
    })).json();

    assert.equal(ruCatalog.locale, 'ru');
    assert.equal(kkCatalog.locale, 'kk');
    assert.deepEqual(kkCatalog.measures.map((measure) => measure.id), ruCatalog.measures.map((measure) => measure.id));
    assert.deepEqual(kkCatalog.measures.map((measure) => measure.cost), ruCatalog.measures.map((measure) => measure.cost));
    assert.equal(kkCatalog.districts.find((district) => district.id === 'nura').name, 'Нұра');
    assert.equal(kkCatalog.measures.find((measure) => measure.id === 'M1').name, 'Автобустарға арналған бөлінген жолақтар');
    assert.match(kkPage, /<html lang="kk">/);
    assert.match(kkPage, /Қала туралы бастапқы деректер/);
    assert.equal(kkResult.result.score, ruResult.result.score);
    assert.equal(kkResult.result.scoreDelta, ruResult.result.scoreDelta);
    assert.deepEqual(kkResult.decisions, ruResult.decisions);
    assert.equal(kkResult.result.weakestDistrict.name, 'Нұра');
    const kkAlternative = kkResult.result.recommendation.result;
    assert.equal(kkAlternative.weakestDistrict.name,
      kkCatalog.districts.find((district) => district.id === kkAlternative.weakestDistrict.id).name);
  });
});

test('Kazakh validation keeps machine-readable codes but localizes their messages', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/scenarios/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions: [], locale: 'kk' }),
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.errors[0].code, 'exactly_five_decisions_required');
    assert.equal(payload.errors[0].message, 'Дәл бес шешімді таңдау қажет.');
  });
});

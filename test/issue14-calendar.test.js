const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../server');
const { buildLagCalendar } = require('../src/lag-calendar');

const officialDecisions = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
];

async function withServer(run) {
  const server = createServer({ analysisProvider: { analyze: async () => { throw new Error('not used'); } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function accept(baseUrl, locale) {
  const response = await fetch(`${baseUrl}/api/scenarios/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attemptId: `calendar-${locale}`, decisions: officialDecisions, locale }),
  });
  return { response, payload: await response.json() };
}

test('calendar gives every accepted decision one Q1-Q8 onset row and only timing facts', () => {
  const calendar = buildLagCalendar(officialDecisions, 'ru');

  assert.equal(calendar.length, officialDecisions.length);
  assert.deepEqual(calendar.map((row) => row.measureId), ['M7', 'M8', 'M10', 'M12', 'M5']);
  assert.equal(calendar.find((row) => row.measureId === 'M7').lag, 3);
  assert.equal(calendar.find((row) => row.measureId === 'M7').onsetQuarter, 4);
  assert.equal(calendar.find((row) => row.measureId === 'M5').onsetQuarter, 4);
  assert.equal(calendar.find((row) => row.measureId === 'M12').onsetQuarter, 2);
  assert.ok(calendar.every((row) => row.quarters.length === 8));
  assert.ok(calendar.every((row) => row.quarters.filter((quarter) => quarter.marker === 'onset').length === 1));
  assert.ok(calendar.every((row) => row.quarters.at(-1).marker === 'q8-result'));

  const city = calendar.find((row) => row.measureId === 'M12');
  const district = calendar.find((row) => row.measureId === 'M5');
  assert.equal(city.scope, 'city');
  assert.equal(city.targetId, null);
  assert.equal(district.scope, 'district');
  assert.equal(district.targetId, 'saryarka');
  assert.equal(district.direction, 'Экология');
  assert.equal(district.cost, 25);
  assert.equal(district.event, 'Перевод частного сектора на чистое топливо');

  const serialized = JSON.stringify(calendar);
  assert.doesNotMatch(serialized, /score|indicator|forecast|probability|incident|value/i);
});

test('accepted API exposes the same calendar facts in Russian and Kazakh without changing timing', async () => {
  await withServer(async (baseUrl) => {
    const russian = await accept(baseUrl, 'ru');
    const kazakh = await accept(baseUrl, 'kk');

    assert.equal(russian.response.status, 200);
    assert.equal(kazakh.response.status, 200);
    assert.equal(russian.payload.result.lagCalendar.length, 5);
    assert.equal(kazakh.payload.result.lagCalendar.length, 5);
    assert.deepEqual(
      kazakh.payload.result.lagCalendar.map(({ measureId, targetId, scope, lag, onsetQuarter, cost }) => ({ measureId, targetId, scope, lag, onsetQuarter, cost })),
      russian.payload.result.lagCalendar.map(({ measureId, targetId, scope, lag, onsetQuarter, cost }) => ({ measureId, targetId, scope, lag, onsetQuarter, cost })),
    );
    assert.notEqual(kazakh.payload.result.lagCalendar[0].event, russian.payload.result.lagCalendar[0].event);
    assert.notEqual(kazakh.payload.result.lagCalendar[3].scopeLabel, russian.payload.result.lagCalendar[3].scopeLabel);
    assert.equal(kazakh.payload.result.score, russian.payload.result.score);
  });
});

test('accepted page and client expose a bilingual Q1-Q8 presentation boundary without intermediate trajectory values', async () => {
  await withServer(async (baseUrl) => {
    const russianPage = await (await fetch(`${baseUrl}/?locale=ru`)).text();
    const kazakhPage = await (await fetch(`${baseUrl}/?locale=kk`)).text();
    const client = await (await fetch(`${baseUrl}/client.js`)).text();

    assert.match(russianPage, /id="lag-calendar"/);
    assert.match(kazakhPage, /id="lag-calendar"/);
    assert.match(russianPage, /Q1/);
    assert.match(kazakhPage, /Q1/);
    assert.match(client, /lagCalendar/);
    assert.match(client, /data-calendar-row/);
    assert.match(client, /end of Q8|конец Q8|Q8/);
    assert.doesNotMatch(client, /quarterlyScore|intermediateIndicator|forecastValue|incidentProbability/);
  });
});

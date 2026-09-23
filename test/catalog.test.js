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

test('default page opens the Russian starting point with the shared budget', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<html lang="ru">/);
    assert.match(html, /Бюджет[^<]*100/);
    assert.match(html, /Исходное состояние города/);
  });
});

test('page shows five districts, population shares, indicator definitions and status markers', async () => {
  await withServer(async (baseUrl) => {
    const html = await (await fetch(`${baseUrl}/`)).text();

    for (const district of ['Есиль', 'Алматы', 'Сарыарка', 'Байконур', 'Нура']) {
      assert.match(html, new RegExp(district));
    }
    assert.match(html, /Доля населения/);
    assert.match(html, /Разгрузка дорог/);
    assert.match(html, /Критическое/);
    assert.match(html, /Слабое/);
    assert.match(html, /data-status="critical"/);
    assert.match(html, /data-status="weak"/);
  });
});

test('page shows all fourteen measures and their decision-making fields', async () => {
  await withServer(async (baseUrl) => {
    const html = await (await fetch(`${baseUrl}/`)).text();

    assert.match(html, /Каталог мероприятий/);
    for (let index = 1; index <= 14; index += 1) {
      assert.match(html, new RegExp(`M${index}\\b`));
    }
    for (const label of ['Направление', 'Стоимость', 'Охват', 'Лаг', 'Заявленные эффекты']) {
      assert.match(html, new RegExp(label));
    }
    assert.match(html, /Один район/);
    assert.match(html, /Весь город/);
  });
});

test('catalog API exposes marked source data without score or scenario results', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/catalog`);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    assert.equal(response.status, 200);
    assert.equal(payload.locale, 'ru');
    assert.equal(payload.budget, 100);
    assert.equal(payload.districts.length, 5);
    assert.equal(payload.indicators.length, 10);
    assert.equal(payload.measures.length, 14);
    assert.equal(payload.districts.find((district) => district.id === 'nura').indicatorStatus.S1, 'critical');
    assert.equal(payload.districts.find((district) => district.id === 'nura').indicatorStatus.T2, 'weak');
    assert.equal(payload.measures.find((measure) => measure.id === 'M12').scope, 'city');
    assert.deepEqual(payload.measures.find((measure) => measure.id === 'M10').effects, { B1: 12, B2: 2 });
    assert.doesNotMatch(serialized, /"(?:score|result|recommendation)"\s*:/i);
  });
});

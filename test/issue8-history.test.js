const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateScenario } = require('../src/simulation');
const { createServer } = require('../server');
const { compareAttempts, createAttemptHistory } = require('../public/history');

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

const firstScenario = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
];

test('accepted attempts are saved once and survive a new history instance', () => {
  const storage = new MemoryStorage();
  const accepted = calculateScenario(firstScenario);
  const history = createAttemptHistory(storage, { now: () => '2026-09-23T12:00:00.000Z', id: () => 'attempt-1' });

  const attempt = history.append(accepted);
  const afterReload = createAttemptHistory(storage).list();

  assert.equal(attempt.id, 'attempt-1');
  assert.equal(afterReload.length, 1);
  assert.deepEqual(afterReload[0].decisions, firstScenario);
  assert.equal(afterReload[0].result.cost, 95);
  assert.ok(Math.abs(afterReload[0].result.score - 56.54307) < 0.000001);
});

test('saving an attempt snapshots it before a later repeat attempt is edited', () => {
  const storage = new MemoryStorage();
  const accepted = calculateScenario(firstScenario);
  const history = createAttemptHistory(storage, { id: () => 'attempt-1' });

  history.append(accepted);
  accepted.decisions[0].measureId = 'M9';
  accepted.result.cost = 0;

  const saved = history.list()[0];
  assert.deepEqual(saved.decisions[0], { measureId: 'M7', districtId: 'nura' });
  assert.equal(saved.result.cost, 95);
});

test('comparison exposes both accepted decisions, costs, scores, and district changes', () => {
  const storage = new MemoryStorage();
  const history = createAttemptHistory(storage, { id: (() => {
    let number = 0;
    return () => `attempt-${++number}`;
  })() });
  const first = history.append(calculateScenario(firstScenario));
  const second = history.append(calculateScenario([
    { measureId: 'M1', districtId: 'nura' },
    { measureId: 'M2', districtId: null },
    { measureId: 'M4', districtId: 'almaty' },
    { measureId: 'M8', districtId: 'nura' },
    { measureId: 'M14', districtId: null },
  ]));

  const comparison = compareAttempts(first, second);

  assert.deepEqual(comparison.left.decisions, firstScenario);
  assert.equal(comparison.left.cost, 95);
  assert.equal(comparison.right.cost, 91);
  assert.equal(comparison.scoreDelta, second.result.score - first.result.score);
  assert.equal(comparison.districts.length, 5);
  assert.ok('T1' in comparison.districts.find((district) => district.id === 'nura').changeDeltas);
});

test('the browser page exposes accepted-attempt history and its local-storage module', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    const historyModule = await fetch(`http://127.0.0.1:${port}/history.js`);
    const client = await (await fetch(`http://127.0.0.1:${port}/client.js`)).text();

    assert.match(page, /id="attempt-history"/);
    assert.match(page, /id="attempt-comparison"/);
    assert.match(client, /data-copy-attempt/);
    assert.equal(historyModule.status, 200);
    assert.match(await historyModule.text(), /QalaHistory/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

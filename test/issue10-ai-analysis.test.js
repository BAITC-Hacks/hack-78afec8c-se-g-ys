const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../server');
const { calculateScenario } = require('../src/simulation');
const { createAttemptHistory } = require('../public/history');

const officialDecisions = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
];

async function withServer(options, run) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, payload: await response.json() };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for test condition');
}

function validAiAnalysis(locale, facts) {
  const factId = facts[0].id;
  return {
    kind: 'ai',
    locale,
    label: locale === 'kk' ? 'AI талдау' : 'AI-разбор',
    sections: ['summary', 'strengths', 'problems', 'replacement'].map((id) => ({
      id,
      title: id,
      conclusions: [{ id: `${id}-conclusion`, text: `${locale}:${id}`, factIds: [factId] }],
    })),
  };
}

test('acceptance requests one cached AI version per attempt and language using the same facts', async () => {
  const calls = [];
  const provider = async ({ locale, facts }) => {
    calls.push({ locale, facts: structuredClone(facts) });
    return validAiAnalysis(locale, facts);
  };

  await withServer({ aiProvider: provider }, async (baseUrl) => {
    const accepted = await post(baseUrl, '/api/scenarios/accept', {
      attemptId: 'attempt-10-a', decisions: officialDecisions, locale: 'ru',
    });
    assert.equal(accepted.response.status, 200);
    assert.equal(accepted.payload.attemptId, 'attempt-10-a');
    assert.equal(accepted.payload.result.basicAnalysis.kind, 'basic');

    const russian = await post(baseUrl, '/api/attempts/attempt-10-a/analysis', { locale: 'ru' });
    const kazakh = await post(baseUrl, '/api/attempts/attempt-10-a/analysis', { locale: 'kk' });
    const russianAgain = await post(baseUrl, '/api/attempts/attempt-10-a/analysis', { locale: 'ru' });

    assert.equal(russian.payload.status, 'ready');
    assert.equal(russian.payload.analysis.locale, 'ru');
    assert.equal(kazakh.payload.analysis.locale, 'kk');
    assert.deepEqual(calls[0].facts, calls[1].facts);
    assert.equal(russianAgain.payload.analysis.sections[0].conclusions[0].text, 'ru:summary');
    assert.equal(calls.length, 2);
  });
});

test('concurrent requests for one attempt-language share one provider call', async () => {
  let calls = 0;
  let release;
  const provider = ({ locale, facts }) => {
    calls += 1;
    return new Promise((resolve) => {
      release = () => resolve(validAiAnalysis(locale, facts));
    });
  };

  await withServer({ aiProvider: provider }, async (baseUrl) => {
    await post(baseUrl, '/api/scenarios/accept', {
      attemptId: 'attempt-10-concurrent', decisions: officialDecisions, locale: 'ru',
    });
    const first = post(baseUrl, '/api/attempts/attempt-10-concurrent/analysis', { locale: 'ru' });
    const second = post(baseUrl, '/api/attempts/attempt-10-concurrent/analysis', { locale: 'ru' });
    await waitFor(() => calls === 1);
    assert.equal(calls, 1);
    release();
    const responses = await Promise.all([first, second]);
    assert.deepEqual(responses[0].payload.analysis, responses[1].payload.analysis);
  });
});

test('late results stay isolated by attempt and language', async () => {
  const pending = new Map();
  const provider = ({ attemptId, locale, facts }) => new Promise((resolve) => {
    pending.set(`${attemptId}:${locale}`, () => resolve(validAiAnalysis(locale, facts)));
  });

  await withServer({ aiProvider: provider }, async (baseUrl) => {
    await post(baseUrl, '/api/scenarios/accept', { attemptId: 'attempt-10-one', decisions: officialDecisions, locale: 'ru' });
    await post(baseUrl, '/api/scenarios/accept', { attemptId: 'attempt-10-two', decisions: officialDecisions, locale: 'kk' });
    const first = post(baseUrl, '/api/attempts/attempt-10-one/analysis', { locale: 'ru' });
    const second = post(baseUrl, '/api/attempts/attempt-10-two/analysis', { locale: 'kk' });
    await waitFor(() => pending.size === 2);
    pending.get('attempt-10-two:kk')();
    pending.get('attempt-10-one:ru')();
    const results = await Promise.all([first, second]);
    assert.equal(results[0].payload.attemptId, 'attempt-10-one');
    assert.equal(results[0].payload.locale, 'ru');
    assert.equal(results[1].payload.attemptId, 'attempt-10-two');
    assert.equal(results[1].payload.locale, 'kk');
  });
});

test('invalid or failed AI responses keep the accepted result and basic analysis available', async () => {
  let calls = 0;
  const provider = async () => { calls += 1; return { kind: 'ai', locale: 'ru', sections: [{ id: 'summary', conclusions: [{ factIds: ['unknown'] }] }] }; };

  await withServer({ aiProvider: provider }, async (baseUrl) => {
    const accepted = await post(baseUrl, '/api/scenarios/accept', {
      attemptId: 'attempt-10-invalid', decisions: officialDecisions, locale: 'ru',
    });
    const analysis = await post(baseUrl, '/api/attempts/attempt-10-invalid/analysis', { locale: 'ru' });

    assert.equal(accepted.payload.result.basicAnalysis.kind, 'basic');
    assert.equal(analysis.payload.status, 'fallback');
    assert.equal(analysis.payload.analysis.kind, 'basic');
    assert.equal(analysis.payload.error.code, 'invalid_ai_analysis');
    const retry = await post(baseUrl, '/api/attempts/attempt-10-invalid/analysis', { locale: 'ru' });
    assert.equal(retry.payload.status, 'fallback');
    assert.equal(calls, 2);
  });
});

test('history stores Russian and Kazakh analyses on the same immutable attempt', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const history = createAttemptHistory(storage, { id: () => 'attempt-10-history' });
  const accepted = calculateScenario(officialDecisions);
  const attempt = history.append({ ...accepted, attemptId: 'attempt-10-history' });
  const russian = validAiAnalysis('ru', accepted.result.facts);
  const kazakh = validAiAnalysis('kk', accepted.result.facts);

  history.saveAnalysis(attempt.id, 'ru', russian);
  history.saveAnalysis(attempt.id, 'kk', kazakh);
  const saved = history.get(attempt.id);

  assert.deepEqual(saved.analyses.ru, russian);
  assert.deepEqual(saved.analyses.kk, kazakh);
  assert.equal(history.list()[0].id, 'attempt-10-history');
});

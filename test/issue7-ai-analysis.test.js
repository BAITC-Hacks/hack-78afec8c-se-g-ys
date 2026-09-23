const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../server');
const { createOpenAiAnalysisProvider } = require('../src/openai-analysis-provider');

const officialDecisions = [
  { measureId: 'M7', districtId: 'nura' },
  { measureId: 'M8', districtId: 'nura' },
  { measureId: 'M10', districtId: 'nura' },
  { measureId: 'M12', districtId: null },
  { measureId: 'M5', districtId: 'saryarka' },
];

function validAnalysis() {
  return {
    sections: [
      { id: 'summary', conclusions: [{ text: 'Итог основан на расчётном результате сценария.', factIds: ['scenario.score', 'scenario.score_delta'] }] },
      { id: 'strengths', conclusions: [{ text: 'Сильная сторона подтверждается наибольшим изменением показателя.', factIds: ['scenario.highest_change.district', 'scenario.highest_change.value'] }] },
      { id: 'problems', conclusions: [{ text: 'Сохраняющиеся проблемы видны в оценке самого слабого района.', factIds: ['scenario.weakest_district.name', 'scenario.weakest_district.score'] }] },
      { id: 'replacement', conclusions: [{ text: 'Точечная замена подтверждена расчётом допустимой альтернативы.', factIds: ['alternative.replacement.from', 'alternative.replacement.to', 'alternative.score_delta'] }] },
    ],
    recommendation: {
      found: true,
      replacedDecision: { measureId: 'M5', districtId: 'saryarka' },
      replacementDecision: { measureId: 'M3', districtId: 'nura' },
    },
  };
}

async function withServer(provider, run) {
  const server = createServer({ analysisProvider: provider });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function requestAnalysis(baseUrl) {
  const response = await fetch(`${baseUrl}/api/scenarios/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decisions: officialDecisions }),
  });
  return { response, payload: await response.json() };
}

test('a recalculated accepted scenario receives a verified Russian AI analysis', async () => {
  let received;
  await withServer({ analyze: async (request) => {
    received = request;
    return validAnalysis();
  } }, async (baseUrl) => {
    const { response, payload } = await requestAnalysis(baseUrl);

    assert.equal(response.status, 200);
    assert.equal(payload.analysis.kind, 'ai');
    assert.equal(payload.analysis.label, 'AI-разбор');
    assert.deepEqual(payload.analysis.sections.map((section) => section.id), ['summary', 'strengths', 'problems', 'replacement']);
    assert.equal(payload.analysis.recommendation.replacementDecision.measureId, 'M3');
  });
  assert.ok(received.facts.some((fact) => fact.id === 'scenario.score'));
  assert.deepEqual(received.recommendation.replacementDecision, { measureId: 'M3', districtId: 'nura' });
  assert.equal('decisions' in received, false);
});

test('an AI analysis with a link to an unknown fact falls back to the basic analysis', async () => {
  const analysis = validAnalysis();
  analysis.sections[1].conclusions[0].factIds = ['scenario.not_a_fact'];
  await withServer({ analyze: async () => analysis }, async (baseUrl) => {
    const { response, payload } = await requestAnalysis(baseUrl);

    assert.equal(response.status, 200);
    assert.equal(payload.source, 'basic');
    assert.equal(payload.analysis.kind, 'basic');
    assert.match(payload.analysis.label, /Базовый разбор/);
  });
});

test('an AI analysis with an unexpected structural field falls back to the basic analysis', async () => {
  const analysis = validAnalysis();
  analysis.sections[0].extra = 'not allowed';
  await withServer({ analyze: async () => analysis }, async (baseUrl) => {
    const { payload } = await requestAnalysis(baseUrl);

    assert.equal(payload.source, 'basic');
  });
});

test('an AI conclusion without its mandatory evidence falls back to the basic analysis', async () => {
  const analysis = validAnalysis();
  analysis.sections[2].conclusions[0].factIds = [];
  await withServer({ analyze: async () => analysis }, async (baseUrl) => {
    const { response, payload } = await requestAnalysis(baseUrl);

    assert.equal(response.status, 200);
    assert.equal(payload.source, 'basic');
    assert.equal(payload.analysis.kind, 'basic');
  });
});

test('a replacement section without replacement evidence falls back to the basic analysis', async () => {
  const analysis = validAnalysis();
  analysis.sections[3].conclusions[0].factIds = ['scenario.score'];
  await withServer({ analyze: async () => analysis }, async (baseUrl) => {
    const { response, payload } = await requestAnalysis(baseUrl);

    assert.equal(response.status, 200);
    assert.equal(payload.source, 'basic');
  });
});

test('an AI-proposed replacement that differs from the calculated recommendation falls back', async () => {
  const analysis = validAnalysis();
  analysis.recommendation.replacementDecision = { measureId: 'M1', districtId: 'nura' };
  await withServer({ analyze: async () => analysis }, async (baseUrl) => {
    const { response, payload } = await requestAnalysis(baseUrl);

    assert.equal(response.status, 200);
    assert.equal(payload.source, 'basic');
    assert.equal(payload.analysis.kind, 'basic');
  });
});

test('a provider error preserves the accepted result through the basic analysis fallback', async () => {
  await withServer({ analyze: async () => { throw new Error('provider_unavailable'); } }, async (baseUrl) => {
    const { response, payload } = await requestAnalysis(baseUrl);

    assert.equal(response.status, 200);
    assert.equal(payload.accepted, true);
    assert.equal(payload.source, 'basic');
    assert.equal(payload.analysis.kind, 'basic');
  });
});

test('the OpenAI adapter requests strict structured Russian output from recalculated facts', async () => {
  let request;
  const provider = createOpenAiAnalysisProvider({
    apiKey: 'test-key',
    model: 'test-model',
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(validAnalysis()) }) };
    },
  });
  const analysis = await provider.analyze({ facts: [{ id: 'scenario.score', value: 10 }], recommendation: { found: false } });
  const body = JSON.parse(request.options.body);

  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(body.model, 'test-model');
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.deepEqual(JSON.parse(body.input[0].content[0].text).facts, [{ id: 'scenario.score', value: 10 }]);
  assert.deepEqual(analysis, validAnalysis());
});

test('the client requests AI analysis after accepting and retries only that saved attempt', async () => {
  await withServer(null, async (baseUrl) => {
    const client = await (await fetch(`${baseUrl}/client.js`)).text();

    assert.match(client, /\/api\/scenarios\/analyze/);
    assert.match(client, /requestAiAnalysis\(payload\.decisions, payload\.result\)/);
    assert.match(client, /retry-ai-analysis/);
    assert.match(client, /acceptedDecisions/);
  });
});

const RESPONSE_FORMAT = {
  type: 'json_schema',
  name: 'qala_scenario_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['sections', 'recommendation'],
    properties: {
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'conclusions'],
          properties: {
            id: { type: 'string', enum: ['summary', 'strengths', 'problems', 'replacement'] },
            conclusions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['text', 'factIds'],
                properties: {
                  text: { type: 'string' },
                  factIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      recommendation: {
        type: 'object',
        additionalProperties: false,
        required: ['found', 'replacedDecision', 'replacementDecision'],
        properties: {
          found: { type: 'boolean' },
          replacedDecision: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['measureId', 'districtId'],
                properties: { measureId: { type: 'string' }, districtId: { type: ['string', 'null'] } },
              },
              { type: 'null' },
            ],
          },
          replacementDecision: {
            anyOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['measureId', 'districtId'],
                properties: { measureId: { type: 'string' }, districtId: { type: ['string', 'null'] } },
              },
              { type: 'null' },
            ],
          },
        },
      },
    },
  },
};

const INSTRUCTIONS = [
  'Сформируй краткий русскоязычный разбор уже принятого сценария.',
  'Используй только переданные расчётные факты и не повторяй числовые значения в тексте: ссылайся на factIds.',
  'Верни ровно четыре раздела: summary, strengths, problems, replacement; в каждом нужен хотя бы один содержательный вывод с factIds.',
  'Не прогнозируй аварии, происшествия или вероятности. Не рассчитывай Score и не предлагай замену, отличную от requiredRecommendation.',
].join(' ');

function requestedRecommendation(recommendation) {
  if (!recommendation?.found) return { found: false, replacedDecision: null, replacementDecision: null };
  return {
    found: true,
    replacedDecision: recommendation.replacedDecision,
    replacementDecision: recommendation.replacementDecision,
  };
}

function createOpenAiAnalysisProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || 'gpt-4o-mini',
  timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 12000),
  fetch: request = globalThis.fetch,
} = {}) {
  if (!apiKey || typeof request !== 'function') return null;
  const requestTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000;

  return {
    async analyze({ facts, recommendation }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const response = await request('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            store: false,
            instructions: INSTRUCTIONS,
            input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ facts, requiredRecommendation: requestedRecommendation(recommendation) }) }] }],
            text: { format: RESPONSE_FORMAT },
          }),
        });
        if (!response.ok) throw new Error('openai_http_error');
        const payload = await response.json();
        if (payload.status !== 'completed' || typeof payload.output_text !== 'string') throw new Error('openai_incomplete_response');
        return JSON.parse(payload.output_text);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

module.exports = { createOpenAiAnalysisProvider, RESPONSE_FORMAT };

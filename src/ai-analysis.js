const SECTION_TITLES = {
  summary: 'Краткое резюме',
  strengths: 'Сильные стороны',
  problems: 'Оставшиеся проблемы и компромиссы',
  replacement: 'Точечная замена',
};

const SECTION_IDS = Object.keys(SECTION_TITLES);

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function sameDecision(left, right) {
  return left && right && hasOnlyKeys(left, ['measureId', 'districtId'])
    && typeof left.measureId === 'string' && (typeof left.districtId === 'string' || left.districtId === null)
    && left.measureId === right.measureId && left.districtId === (right.districtId ?? null);
}

function validateAiAnalysis(candidate, result) {
  if (!candidate || typeof candidate !== 'object' || !hasOnlyKeys(candidate, ['sections', 'recommendation']) || !Array.isArray(candidate.sections)) return null;
  const facts = new Set(result.facts.map((fact) => fact.id));
  if (candidate.sections.length !== SECTION_IDS.length) return null;

  const sections = [];
  for (const id of SECTION_IDS) {
    const section = candidate.sections.find((item) => item?.id === id);
    if (!section || !hasOnlyKeys(section, ['id', 'conclusions']) || !Array.isArray(section.conclusions) || section.conclusions.length === 0) return null;
    const conclusions = [];
    for (const conclusion of section.conclusions) {
      if (!conclusion || !hasOnlyKeys(conclusion, ['text', 'factIds']) || typeof conclusion.text !== 'string' || !conclusion.text.trim()
        || !Array.isArray(conclusion.factIds) || conclusion.factIds.length === 0
        || !conclusion.factIds.every((factId) => typeof factId === 'string' && facts.has(factId))) return null;
      conclusions.push({ text: conclusion.text.trim(), factIds: [...conclusion.factIds] });
    }
    sections.push({ id, title: SECTION_TITLES[id], conclusions });
  }

  const expected = result.recommendation;
  const recommendation = candidate.recommendation;
  if (!recommendation || !hasOnlyKeys(recommendation, ['found', 'replacedDecision', 'replacementDecision']) || recommendation.found !== expected.found) return null;
  if (expected.found && (!sameDecision(recommendation.replacedDecision, expected.replacedDecision)
    || !sameDecision(recommendation.replacementDecision, expected.replacementDecision))) return null;
  if (!expected.found && (recommendation.replacedDecision != null || recommendation.replacementDecision != null)) return null;
  if (expected.found) {
    const replacementFacts = new Set(sections.find((section) => section.id === 'replacement').conclusions.flatMap((conclusion) => conclusion.factIds));
    if (!replacementFacts.has('alternative.replacement.from')
      || !replacementFacts.has('alternative.replacement.to')
      || !replacementFacts.has('alternative.score_delta')) return null;
  }

  return {
    kind: 'ai',
    label: 'AI-разбор',
    sections,
    recommendation: expected.found
      ? { found: true, replacedDecision: expected.replacedDecision, replacementDecision: expected.replacementDecision }
      : { found: false, replacedDecision: null, replacementDecision: null },
  };
}

async function analyzeScenario(calculation, provider) {
  const fallback = { analysis: calculation.result.basicAnalysis, source: 'basic' };
  if (!provider?.analyze) return fallback;
  try {
    const candidate = await provider.analyze({
      facts: calculation.result.facts,
      recommendation: calculation.result.recommendation,
    });
    const analysis = validateAiAnalysis(candidate, calculation.result);
    return analysis ? { analysis, source: 'ai' } : fallback;
  } catch {
    return fallback;
  }
}

module.exports = { analyzeScenario, validateAiAnalysis };
/* Superseded implementation retained in history; cached API uses the compatible service below.
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ANALYSIS_SECTIONS = ['summary', 'strengths', 'problems', 'replacement'];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function aiError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function validateAiAnalysis(candidate, { locale, facts }) {
  if (!candidate || candidate.kind !== 'ai' || candidate.locale !== locale || !Array.isArray(candidate.sections)) {
    throw aiError('invalid_ai_analysis', 'AI response has an invalid top-level structure');
  }
  const factsById = new Set(facts.map((fact) => fact.id));
  const sectionsById = new Map(candidate.sections.map((section) => [section.id, section]));
  if (candidate.sections.length !== ANALYSIS_SECTIONS.length || ANALYSIS_SECTIONS.some((id) => !sectionsById.has(id))) {
    throw aiError('invalid_ai_analysis', 'AI response must contain all analysis sections');
  }

  const sections = ANALYSIS_SECTIONS.map((id) => {
    const section = sectionsById.get(id);
    if (!section || typeof section.title !== 'string' || !Array.isArray(section.conclusions) || !section.conclusions.length) {
      throw aiError('invalid_ai_analysis', `AI section ${id} is incomplete`);
    }
    const conclusions = section.conclusions.map((conclusion) => {
      if (!conclusion || typeof conclusion.id !== 'string' || typeof conclusion.text !== 'string'
        || !conclusion.text.trim() || !Array.isArray(conclusion.factIds) || !conclusion.factIds.length
        || conclusion.factIds.some((factId) => !factsById.has(factId))) {
        throw aiError('invalid_ai_analysis', `AI section ${id} contains an unsupported conclusion`);
      }
      return { id: conclusion.id, text: conclusion.text, factIds: [...new Set(conclusion.factIds)] };
    });
    return { id, title: section.title, conclusions };
  });
  return {
    kind: 'ai',
    locale,
    label: typeof candidate.label === 'string' && candidate.label ? candidate.label : 'AI-разбор',
    sections,
  };
}

function createOpenAiProvider({ apiKey = process.env.OPENAI_API_KEY, model = DEFAULT_MODEL, fetchImpl = globalThis.fetch } = {}) {
  return async ({ locale, facts }) => {
    if (!apiKey) throw aiError('ai_not_configured', 'OPENAI_API_KEY is not configured');
    if (typeof fetchImpl !== 'function') throw aiError('ai_unavailable', 'Fetch is not available for the AI provider');
    const language = locale === 'kk' ? 'Kazakh (kk)' : 'Russian (ru)';
    const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `You explain a city scenario in ${language}. Return only JSON with kind "ai", locale "${locale}", label, and sections summary, strengths, problems, replacement. Each section has conclusions with id, text, and factIds. Use only the supplied fact IDs.` },
          { role: 'user', content: JSON.stringify({ locale, facts }) },
        ],
      }),
    });
    if (!response.ok) throw aiError('ai_provider_error', `OpenAI returned HTTP ${response.status}`);
    let payload;
    try { payload = await response.json(); } catch (error) { throw aiError('ai_provider_error', 'OpenAI returned invalid JSON', error); }
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw aiError('ai_provider_error', 'OpenAI response did not contain message content');
    try { return JSON.parse(content); } catch (error) { throw aiError('invalid_ai_analysis', 'OpenAI message content was not valid JSON', error); }
  };
}

function normalizeFailure(error) {
  return {
    code: error?.code || 'ai_provider_error',
    message: error?.message || 'AI analysis is unavailable',
  };
}

function createAiAnalysisService({ provider = createOpenAiProvider() } = {}) {
  const ready = new Map();
  const pending = new Map();

  function keyFor(attemptId, locale) {
    return `${attemptId}:${locale}`;
  }

  function request(context) {
    const { attemptId, locale, facts, basicAnalysis } = context;
    const key = keyFor(attemptId, locale);
    if (ready.has(key)) return Promise.resolve({ status: 'ready', analysis: clone(ready.get(key)) });
    if (pending.has(key)) return pending.get(key);

    let providerResult;
    try {
      providerResult = provider({ ...context, facts: clone(facts) });
    } catch (error) {
      providerResult = Promise.reject(error);
    }
    const promise = Promise.resolve(providerResult)
      .then((candidate) => {
        const analysis = validateAiAnalysis(candidate, { locale, facts });
        ready.set(key, clone(analysis));
        return { status: 'ready', analysis: clone(analysis) };
      })
      .catch((error) => ({ status: 'fallback', analysis: clone(basicAnalysis), error: normalizeFailure(error) }))
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }

  return { request };
}

module.exports = {
  ANALYSIS_SECTIONS,
  createAiAnalysisService,
  createOpenAiProvider,
  validateAiAnalysis,
};
*/

const CACHED_SECTION_IDS = ['summary', 'strengths', 'problems', 'replacement'];

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cachedAnalysisError(message) {
  const error = new Error(message);
  error.code = 'invalid_ai_analysis';
  return error;
}

function validateCachedAiAnalysis(candidate, { locale, facts }) {
  if (!candidate || candidate.kind !== 'ai' || candidate.locale !== locale || !Array.isArray(candidate.sections)) throw cachedAnalysisError('AI response has an invalid top-level structure');
  const factIds = new Set(facts.map((fact) => fact.id));
  const sections = new Map(candidate.sections.map((section) => [section.id, section]));
  if (candidate.sections.length !== CACHED_SECTION_IDS.length || CACHED_SECTION_IDS.some((id) => !sections.has(id))) throw cachedAnalysisError('AI response must contain all analysis sections');
  return {
    kind: 'ai',
    locale,
    label: typeof candidate.label === 'string' && candidate.label ? candidate.label : 'AI-разбор',
    sections: CACHED_SECTION_IDS.map((id) => {
      const section = sections.get(id);
      if (!section || typeof section.title !== 'string' || !Array.isArray(section.conclusions) || !section.conclusions.length) throw cachedAnalysisError(`AI section ${id} is incomplete`);
      const conclusions = section.conclusions.map((conclusion) => {
        if (!conclusion || typeof conclusion.text !== 'string' || !conclusion.text.trim() || !Array.isArray(conclusion.factIds) || !conclusion.factIds.length || conclusion.factIds.some((factId) => !factIds.has(factId))) throw cachedAnalysisError(`AI section ${id} contains an unsupported conclusion`);
        return { id: typeof conclusion.id === 'string' ? conclusion.id : `${id}-conclusion`, text: conclusion.text, factIds: [...new Set(conclusion.factIds)] };
      });
      return { id, title: section.title, conclusions };
    }),
  };
}

function createAiAnalysisService({ provider } = {}) {
  const ready = new Map();
  const pending = new Map();
  return {
    request(context) {
      const key = `${context.attemptId}:${context.locale}`;
      if (ready.has(key)) return Promise.resolve({ status: 'ready', analysis: clone(ready.get(key)) });
      if (pending.has(key)) return pending.get(key);
      const promise = Promise.resolve().then(() => {
        if (typeof provider !== 'function') throw new Error('AI provider is unavailable');
        return provider({ ...context, facts: clone(context.facts) });
      }).then((candidate) => {
        const analysis = validateCachedAiAnalysis(candidate, context);
        ready.set(key, clone(analysis));
        return { status: 'ready', analysis: clone(analysis) };
      }).catch((error) => ({ status: 'fallback', analysis: clone(context.basicAnalysis), error: { code: error.code || 'ai_provider_error', message: error.message || 'AI analysis is unavailable' } })).finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
  };
}

module.exports.createAiAnalysisService = createAiAnalysisService;
module.exports.validateCachedAiAnalysis = validateCachedAiAnalysis;

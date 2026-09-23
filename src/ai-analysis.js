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

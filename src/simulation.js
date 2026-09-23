const { districts, indicators, measures } = require('./data');

const BUDGET = 100;
const HORIZON_QUARTERS = 8;
const CATALOG_VERSION = 'qala-catalog-v1';
const MODEL_VERSION = 'qala-score-q8-v1';
const weights = { T1: 0.10, T2: 0.10, E1: 0.09, E2: 0.11, S1: 0.11, S2: 0.11, B1: 0.09, B2: 0.09, C1: 0.10, C2: 0.10 };
const districtById = new Map(districts.map((district) => [district.id, district]));
const measureById = new Map(measures.map((measure) => [measure.id, measure]));
const measureOrder = new Map(measures.map((measure, index) => [measure.id, index]));
const districtOrder = new Map(districts.map((district, index) => [district.id, index]));

function error(code, message, decisionIndex = null) {
  return { code, message, decisionIndex };
}

function validateScenario(decisions) {
  const errors = [];
  if (!Array.isArray(decisions)) {
    return { valid: false, cost: 0, errors: [error('decisions_required', 'Decisions must be an array')] };
  }
  if (decisions.length !== 5) errors.push(error('exactly_five_decisions_required', 'Exactly five decisions are required'));

  const seenMeasures = new Set();
  const directions = new Map();
  let cost = 0;
  for (const [index, decision] of decisions.entries()) {
    const measure = measureById.get(decision?.measureId);
    if (!measure) {
      errors.push(error('unknown_measure', 'Measure does not exist in the catalog', index));
      continue;
    }
    cost += measure.cost;
    if (seenMeasures.has(measure.id)) errors.push(error('duplicate_measure', 'A measure may be selected only once', index));
    seenMeasures.add(measure.id);
    directions.set(measure.direction, (directions.get(measure.direction) || 0) + 1);
    if (measure.scope === 'district' && !districtById.has(decision.districtId)) {
      errors.push(error('district_required', 'A district measure requires one existing district', index));
    }
    if (measure.scope === 'city' && decision.districtId != null) {
      errors.push(error('city_measure_has_no_district', 'A city measure must not have a district', index));
    }
  }
  if (cost > BUDGET) errors.push(error('budget_exceeded', 'Scenario cost exceeds the budget'));
  for (const [direction, count] of directions) {
    if (count > 2) errors.push(error('direction_limit_exceeded', `Direction ${direction} contains more than two measures`));
  }

  const selected = [...seenMeasures];
  if (selected.includes('M1') && selected.includes('M3')) errors.push(error('incompatible_measures', 'M1 and M3 cannot be selected together'));
  const selectedDecision = (id) => decisions.find((decision) => decision.measureId === id);
  for (const [left, right] of [['M4', 'M7'], ['M5', 'M13']]) {
    const first = selectedDecision(left);
    const second = selectedDecision(right);
    if (first?.districtId && first.districtId === second?.districtId) errors.push(error('incompatible_measures', `${left} and ${right} cannot target the same district`));
  }
  return { valid: errors.length === 0, cost, errors };
}

function initialIndicators() {
  return Object.fromEntries(districts.map((district) => [district.id, { ...district.indicators }]));
}

function normalizeDecision(decision) {
  return { measureId: decision.measureId, districtId: decision.districtId ?? null };
}

function compareDecisions(left, right) {
  const measureDifference = measureOrder.get(left.measureId) - measureOrder.get(right.measureId);
  if (measureDifference !== 0) return measureDifference;
  return (districtOrder.get(left.districtId) ?? -1) - (districtOrder.get(right.districtId) ?? -1);
}

function canonicalDecisions(decisions) {
  return decisions.map(normalizeDecision).sort(compareDecisions);
}

function addEffect(values, districtId, indicatorId, effect) {
  values[districtId][indicatorId] += effect;
}

function calculateValues(decisions, canonicalize = true) {
  const values = initialIndicators();
  for (const decision of canonicalize ? canonicalDecisions(decisions) : decisions) {
    const measure = measureById.get(decision.measureId);
    const targets = measure.scope === 'city' ? districts.map((district) => district.id) : [decision.districtId];
    const factor = (HORIZON_QUARTERS - measure.delay) / HORIZON_QUARTERS;
    for (const districtId of targets) {
      for (const [indicatorId, effect] of Object.entries(measure.effects)) addEffect(values, districtId, indicatorId, effect * factor);
    }
  }

  const byId = new Map(decisions.map((decision) => [decision.measureId, decision]));
  const synergies = [];
  const activate = (id, title, districtId, indicatorId, bonus) => {
    addEffect(values, districtId, indicatorId, bonus);
    synergies.push({ id, title, districtId, indicatorId, bonus });
  };
  if (byId.has('M1') && byId.has('M2')) activate('M1+M2', 'M1 + M2', byId.get('M1').districtId, 'T1', 2);
  if (byId.has('M10') && byId.has('M12')) activate('M10+M12', 'M10 + M12', byId.get('M10').districtId, 'B1', 2);
  if (byId.has('M5') && byId.has('M6')) activate('M5+M6', 'M5 + M6', byId.get('M5').districtId, 'E2', 2);

  return { values, synergies };
}

function calculateState(decisions) {
  const { values, synergies } = calculateValues(decisions);
  const districtResults = districts.map((district) => {
    const finalIndicators = Object.fromEntries(Object.entries(values[district.id]).map(([id, value]) => [id, Math.min(100, Math.max(0, value))]));
    const changes = Object.fromEntries(indicators.map((indicator) => [indicator.id, finalIndicators[indicator.id] - district.indicators[indicator.id]]));
    const score = indicators.reduce((sum, indicator) => sum + finalIndicators[indicator.id] * weights[indicator.id], 0);
    return { id: district.id, name: district.name, populationShare: district.populationShare, indicators: finalIndicators, changes, score };
  });
  const weightedAverage = districtResults.reduce((sum, district) => sum + district.score * district.populationShare, 0);
  const weakestDistrict = districtResults.reduce((weakest, district) => district.score < weakest.score ? district : weakest, districtResults[0]);
  const criticalIndicators = districtResults.flatMap((district) => indicators.filter((indicator) => district.indicators[indicator.id] < 40).map((indicator) => ({ districtId: district.id, districtName: district.name, indicatorId: indicator.id, value: district.indicators[indicator.id] })));
  return { districtResults, weightedAverage, weakestDistrict, criticalIndicators, synergies, score: 0.7 * weightedAverage + 0.3 * weakestDistrict.score - criticalIndicators.length };
}

function calculateScore(decisions) {
  const { values } = calculateValues(decisions, false);
  let weightedAverage = 0;
  let weakestScore = Infinity;
  let criticalCount = 0;
  for (const district of districts) {
    let districtScore = 0;
    for (const indicator of indicators) {
      const value = Math.min(100, Math.max(0, values[district.id][indicator.id]));
      districtScore += value * weights[indicator.id];
      if (value < 40) criticalCount += 1;
    }
    weightedAverage += districtScore * district.populationShare;
    weakestScore = Math.min(weakestScore, districtScore);
  }
  return 0.7 * weightedAverage + 0.3 * weakestScore - criticalCount;
}

const BASE_STATE = calculateState([]);

function scenarioResult(validation, state) {
  return {
    cost: validation.cost,
    remainingBudget: BUDGET - validation.cost,
    horizonQuarters: HORIZON_QUARTERS,
    districts: state.districtResults,
    weightedAverage: state.weightedAverage,
    weakestDistrict: { id: state.weakestDistrict.id, name: state.weakestDistrict.name, score: state.weakestDistrict.score },
    criticalCount: state.criticalIndicators.length,
    criticalIndicators: state.criticalIndicators,
    synergies: state.synergies,
    baseScore: BASE_STATE.score,
    score: state.score,
    scoreDelta: state.score - BASE_STATE.score,
  };
}

function candidateDecisions() {
  return measures.flatMap((measure) => measure.scope === 'city'
    ? [{ measureId: measure.id, districtId: null }]
    : districts.map((district) => ({ measureId: measure.id, districtId: district.id })));
}

function compareDecisionLists(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    const difference = compareDecisions(left[index], right[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}

function isBetterGlobalCandidate(candidate, best) {
  if (!best || candidate.score > best.score) return true;
  if (candidate.score < best.score) return false;
  if (candidate.validation.cost < best.validation.cost) return true;
  if (candidate.validation.cost > best.validation.cost) return false;
  return compareDecisionLists(candidate.decisions, best.decisions) < 0;
}

function forEachGlobalScenario(visitor) {
  function assignTargets(selectedMeasures, index, decisions) {
    if (index === selectedMeasures.length) {
      visitor(decisions);
      return;
    }
    const measure = selectedMeasures[index];
    const targets = measure.scope === 'city' ? [null] : districts.map((district) => district.id);
    for (const districtId of targets) {
      assignTargets(selectedMeasures, index + 1, [...decisions, { measureId: measure.id, districtId }]);
    }
  }

  function chooseMeasures(start, selectedMeasures) {
    if (selectedMeasures.length === 5) {
      assignTargets(selectedMeasures, 0, []);
      return;
    }
    const remaining = 5 - selectedMeasures.length;
    for (let index = start; index <= measures.length - remaining; index += 1) {
      chooseMeasures(index + 1, [...selectedMeasures, measures[index]]);
    }
  }

  chooseMeasures(0, []);
}

let cachedGlobalOptimum = null;

function findGlobalOptimum() {
  if (cachedGlobalOptimum) return JSON.parse(JSON.stringify(cachedGlobalOptimum));

  let best = null;
  let tieCount = 0;
  let validScenarioCount = 0;
  forEachGlobalScenario((decisions) => {
    const validation = validateScenario(decisions);
    if (!validation.valid) return;
    validScenarioCount += 1;
    const candidate = {
      decisions: canonicalDecisions(decisions),
      validation,
      score: calculateScore(decisions),
    };
    if (!best || candidate.score > best.score) {
      best = candidate;
      tieCount = 1;
      return;
    }
    if (candidate.score === best.score) {
      tieCount += 1;
      if (isBetterGlobalCandidate(candidate, best)) best = candidate;
    }
  });

  cachedGlobalOptimum = {
    decisions: best.decisions,
    cost: best.validation.cost,
    score: best.score,
    scoreDisplay: best.score.toFixed(5),
    tieCount,
    validScenarioCount,
  };
  return JSON.parse(JSON.stringify(cachedGlobalOptimum));
}

function compareWithGlobalOptimum(acceptedCalculation) {
  if (!acceptedCalculation?.accepted) throw new TypeError('An accepted scenario is required for global comparison');
  const global = findGlobalOptimum();
  const participant = {
    decisions: canonicalDecisions(acceptedCalculation.decisions),
    cost: acceptedCalculation.result.cost,
    score: acceptedCalculation.result.score,
    scoreDisplay: acceptedCalculation.result.score.toFixed(5),
  };
  const decisionDetails = global.decisions.map((decision) => {
    const measure = measureById.get(decision.measureId);
    return {
      ...decision,
      direction: measure.direction,
      cost: measure.cost,
      scope: measure.scope,
      delay: measure.delay,
    };
  });
  return {
    kind: 'global_optimum',
    catalogVersion: CATALOG_VERSION,
    modelVersion: MODEL_VERSION,
    participant,
    global: { ...global, decisionDetails },
    delta: global.score - participant.score,
  };
}

function impactList(baseState, candidateState) {
  return districts.map((district) => {
    const baseDistrict = baseState.districtResults.find((item) => item.id === district.id);
    const candidateDistrict = candidateState.districtResults.find((item) => item.id === district.id);
    const changes = indicators.map((indicator) => ({
      indicatorId: indicator.id,
      from: baseDistrict.changes[indicator.id],
      to: candidateDistrict.changes[indicator.id],
      delta: candidateDistrict.changes[indicator.id] - baseDistrict.changes[indicator.id],
    }));
    return {
      id: district.id,
      name: district.name,
      scoreDelta: candidateDistrict.score - baseDistrict.score,
      gains: changes.filter((change) => change.delta > 0),
      losses: changes.filter((change) => change.delta < 0),
    };
  });
}

function compareCandidates(left, right) {
  const replacementOrder = compareDecisions(left.replacementDecision, right.replacementDecision);
  if (replacementOrder !== 0) return replacementOrder;
  return compareDecisions(left.replacedDecision, right.replacedDecision);
}

function findRecommendation(decisions, baseValidation, baseState) {
  const baseDecisions = canonicalDecisions(decisions);
  const options = candidateDecisions();
  let best = null;

  baseDecisions.forEach((replacedDecision, index) => {
    options.forEach((replacementDecision) => {
      if (replacementDecision.measureId === replacedDecision.measureId
        && replacementDecision.districtId === replacedDecision.districtId) return;

      const replacement = baseDecisions.map((decision, decisionIndex) => decisionIndex === index ? replacementDecision : decision);
      const validation = validateScenario(replacement);
      if (!validation.valid) return;
      const state = calculateState(replacement);
      const scoreDelta = state.score - baseState.score;
      if (scoreDelta <= 0) return;

      const candidate = {
        replacedDecision,
        replacementDecision,
        decisions: canonicalDecisions(replacement),
        validation,
        state,
        scoreDelta,
      };
      if (!best
        || scoreDelta > best.scoreDelta
        || (scoreDelta === best.scoreDelta && (validation.cost < best.validation.cost
          || (validation.cost === best.validation.cost && compareCandidates(candidate, best) < 0)))) {
        best = candidate;
      }
    });
  });

  if (!best) {
    return {
      found: false,
      reason: 'no_positive_single_replacement',
      message: 'Ни одна точечная замена не даёт строго положительного прироста Score; это не означает достижения глобального максимума.',
      scoreDelta: 0,
      impacts: [],
    };
  }

  const result = scenarioResult(best.validation, best.state);
  return {
    found: true,
    replacedDecision: best.replacedDecision,
    replacementDecision: best.replacementDecision,
    changedDecision: { from: best.replacedDecision, to: best.replacementDecision },
    decisions: best.decisions,
    cost: best.validation.cost,
    costDelta: best.validation.cost - baseValidation.cost,
    score: best.state.score,
    scoreDelta: best.scoreDelta,
    result: { accepted: true, decisions: best.decisions, ...result },
    impacts: impactList(baseState, best.state),
  };
}

function fact(id, scope, label, value, unit = '') {
  return { id, scope, label, value, unit };
}

function decisionValue(decision) {
  const measure = measureById.get(decision.measureId);
  const district = decision.districtId ? districtById.get(decision.districtId) : null;
  return `${measure.id} · ${measure.name}${district ? ` · ${district.name}` : ' · весь город'}`;
}

function highestChange(districtResults) {
  return districtResults.flatMap((district) => indicators.map((indicator) => ({
    district,
    indicator,
    change: district.changes[indicator.id],
  }))).reduce((best, candidate) => candidate.change > best.change ? candidate : best);
}

function buildFacts(result) {
  const facts = [
    fact('scenario.score', 'scenario', 'Astana Quality of Life Score', result.score, 'балла'),
    fact('scenario.score_delta', 'scenario', 'Прирост Score относительно базового состояния', result.scoreDelta, 'балла'),
    fact('scenario.cost', 'scenario', 'Расход сценария', result.cost, 'ед.'),
    fact('scenario.remaining_budget', 'scenario', 'Остаток бюджета', result.remainingBudget, 'ед.'),
    fact('scenario.weighted_average', 'scenario', 'Средневзвешенный результат районов', result.weightedAverage, 'балла'),
    fact('scenario.weakest_district.name', 'scenario', 'Самый слабый район', result.weakestDistrict.name),
    fact('scenario.weakest_district.score', 'scenario', 'Оценка самого слабого района', result.weakestDistrict.score, 'балла'),
    fact('scenario.critical_count', 'scenario', 'Количество критических показателей', result.criticalCount, 'шт.'),
  ];
  const highest = highestChange(result.districts);
  facts.push(
    fact('scenario.highest_change.district', 'scenario', 'Район с наибольшим изменением показателя', highest.district.name),
    fact('scenario.highest_change.indicator', 'scenario', 'Показатель с наибольшим изменением', highest.indicator.id),
    fact('scenario.highest_change.value', 'scenario', 'Наибольшее изменение показателя', highest.change, 'пункта'),
  );

  result.districts.forEach((district) => {
    facts.push(fact(`scenario.district.${district.id}.score`, 'scenario', `Оценка района «${district.name}»`, district.score, 'балла'));
    indicators.forEach((indicator) => {
      const value = district.indicators[indicator.id];
      if (value < 55) {
        facts.push(fact(`scenario.district.${district.id}.indicator.${indicator.id}.value`, 'scenario', `${district.name}: ${indicator.id} на Q8`, value, 'пункта'));
      }
    });
  });
  result.synergies.forEach((synergy) => {
    facts.push(fact(`scenario.synergy.${synergy.id}`, 'scenario', `Синергия ${synergy.title}`, synergy.bonus, `пункта ${synergy.indicatorId}`));
  });

  const recommendation = result.recommendation;
  if (!recommendation.found) return facts;

  facts.push(
    fact('alternative.score', 'alternative', 'Score допустимой альтернативы', recommendation.score, 'балла'),
    fact('alternative.score_delta', 'alternative', 'Прирост Score альтернативы к принятому сценарию', recommendation.scoreDelta, 'балла'),
    fact('alternative.cost', 'alternative', 'Расход допустимой альтернативы', recommendation.cost, 'ед.'),
    fact('alternative.cost_delta', 'alternative', 'Изменение расхода при точечной замене', recommendation.costDelta, 'ед.'),
    fact('alternative.replacement.from', 'alternative', 'Заменяемое решение', decisionValue(recommendation.replacedDecision)),
    fact('alternative.replacement.to', 'alternative', 'Новое решение', decisionValue(recommendation.replacementDecision)),
  );
  recommendation.impacts.forEach((impact) => {
    impact.losses.forEach((loss) => {
      facts.push(fact(`alternative.district.${impact.id}.indicator.${loss.indicatorId}.loss`, 'alternative', `${impact.name}: изменение ${loss.indicatorId} при замене`, loss.delta, 'пункта'));
    });
  });
  return facts;
}

function buildBasicAnalysis(result) {
  const facts = buildFacts(result);
  const factIds = new Set(facts.map((item) => item.id));
  const weakFacts = facts.filter((item) => item.id.includes('.indicator.') && item.id.endsWith('.value')).map((item) => item.id);
  const problems = [{
    id: 'weakest-district',
    text: 'Самый слабый район в рассчитанном результате сохраняется точкой внимания модели.',
    factIds: ['scenario.weakest_district.name', 'scenario.weakest_district.score'],
  }];
  if (weakFacts.length) {
    problems.push({
      id: 'remaining-weak-indicators',
      text: 'В модели остаются слабые показатели. Это расчётные значения на Q8, а не прогноз городских происшествий.',
      factIds: weakFacts,
    });
  } else {
    problems.push({
      id: 'critical-indicators',
      text: 'Критические показатели определяются только по рассчитанному порогу ниже 40.',
      factIds: ['scenario.critical_count'],
    });
  }

  const recommendation = result.recommendation;
  const replacement = recommendation.found
    ? [{
      id: 'targeted-replacement',
      text: 'Рассчитана допустимая точечная замена: остальные четыре решения сценария не меняются.',
      factIds: ['alternative.replacement.from', 'alternative.replacement.to', 'alternative.score_delta', 'alternative.cost_delta'],
    }]
    : [{
      id: 'no-targeted-replacement',
      text: 'В расчёте не найдено точечной замены со строго положительным приростом Score; это не доказывает глобальный максимум.',
      factIds: ['scenario.score'],
    }];
  const tradeoffFacts = facts.filter((item) => item.id.endsWith('.loss')).map((item) => item.id);
  if (recommendation.found) {
    problems.push({
      id: 'replacement-tradeoffs',
      text: tradeoffFacts.length
        ? 'Допустимая замена меняет одни показатели в пользу других; потери ниже рассчитаны для этой альтернативы.'
        : 'Допустимая замена сравнивается только с принятым сценарием по рассчитанным Score и расходу.',
      factIds: [...tradeoffFacts, 'alternative.score_delta', 'alternative.cost_delta'],
    });
  }

  const sections = [
    {
      id: 'summary',
      title: 'Итог',
      conclusions: [{
        id: 'scenario-result',
        text: 'Итоговая оценка и её изменение относительно базового состояния рассчитаны локально для принятого сценария.',
        factIds: ['scenario.score', 'scenario.score_delta', 'scenario.cost', 'scenario.remaining_budget', 'scenario.weighted_average'],
      }],
    },
    {
      id: 'strengths',
      title: 'Сильные стороны',
      conclusions: [{
        id: 'largest-improvement',
        text: 'Наибольшее рассчитанное улучшение показателя показывает сильную сторону этого набора решений на горизонте Q8.',
        factIds: ['scenario.highest_change.district', 'scenario.highest_change.indicator', 'scenario.highest_change.value', 'scenario.critical_count'],
      }],
    },
    { id: 'problems', title: 'Оставшиеся проблемы и компромиссы', conclusions: problems },
    { id: 'replacement', title: 'Точечная замена', conclusions: replacement },
  ];
  for (const section of sections) {
    for (const conclusion of section.conclusions) {
      if (!conclusion.factIds.length || !conclusion.factIds.every((id) => factIds.has(id))) throw new Error('basic_analysis_has_unknown_fact');
    }
  }
  return { label: 'Базовый разбор', kind: 'basic', sections, facts };
}

function calculateScenario(decisions) {
  const validation = validateScenario(decisions);
  if (!validation.valid) return { accepted: false, errors: validation.errors };
  const state = calculateState(decisions);
  const result = scenarioResult(validation, state);
  result.recommendation = findRecommendation(decisions, validation, state);
  const { facts, ...basicAnalysis } = buildBasicAnalysis(result);
  result.facts = facts;
  result.basicAnalysis = basicAnalysis;
  return {
    accepted: true,
    decisions: decisions.map((decision) => ({ measureId: decision.measureId, districtId: decision.districtId ?? null })),
    result,
  };
}

module.exports = {
  BUDGET,
  HORIZON_QUARTERS,
  CATALOG_VERSION,
  MODEL_VERSION,
  validateScenario,
  calculateScenario,
  findRecommendation,
  findGlobalOptimum,
  compareWithGlobalOptimum,
  isBetterGlobalCandidate,
};

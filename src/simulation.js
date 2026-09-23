const { districts, indicators, measures } = require('./data');

const BUDGET = 100;
const HORIZON_QUARTERS = 8;
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

function calculateState(decisions) {
  const values = initialIndicators();
  for (const decision of canonicalDecisions(decisions)) {
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
      message: 'No single replacement improves Score; this is not a claim of a global optimum.',
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

function calculateScenario(decisions) {
  const validation = validateScenario(decisions);
  if (!validation.valid) return { accepted: false, errors: validation.errors };
  const state = calculateState(decisions);
  const result = scenarioResult(validation, state);
  result.recommendation = findRecommendation(decisions, validation, state);
  return {
    accepted: true,
    decisions: decisions.map((decision) => ({ measureId: decision.measureId, districtId: decision.districtId ?? null })),
    result,
  };
}

module.exports = { BUDGET, HORIZON_QUARTERS, validateScenario, calculateScenario, findRecommendation };

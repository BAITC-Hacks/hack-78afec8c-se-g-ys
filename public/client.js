const search = document.querySelector('#search');
const scope = document.querySelector('#scope');
const cards = [...document.querySelectorAll('[data-measure]')];
const empty = document.querySelector('#empty');
const draft = [];
const draftList = document.querySelector('#draft-list');
const draftMessage = document.querySelector('#draft-message');
const accept = document.querySelector('#accept-scenario');
const resultPanel = document.querySelector('#result-panel');
const acceptedResultStorageKey = 'qala.accepted-result.v1';
let acceptedResult = null;

function filterMeasures() {
  const query = search.value.trim().toLowerCase();
  const selectedScope = scope.value;
  let visible = 0;
  cards.forEach((card) => {
    const shown = card.textContent.toLowerCase().includes(query) && (selectedScope === 'all' || card.dataset.scope === selectedScope);
    card.hidden = !shown;
    if (shown) visible += 1;
  });
  empty.hidden = visible !== 0;
}

function measureOf(id) {
  const card = cards.find((item) => item.dataset.measureId === id);
  return { id, cost: Number(card.dataset.cost), direction: card.dataset.direction, scope: card.dataset.scope };
}

function decisionLabel(decision) {
  return `${decision.measureId} · ${decision.districtId || 'Весь город'}`;
}

function impactLabel(change) {
  return `${change.indicatorId}: ${change.delta > 0 ? '+' : ''}${change.delta.toFixed(2)}`;
}

function recommendationMarkup(recommendation) {
  if (!recommendation.found) {
    return `<section class="recommendation"><h3>Рекомендуемая точечная замена</h3><p>${recommendation.message}</p></section>`;
  }
  const impactMarkup = recommendation.impacts.map((impact) => {
    const gains = impact.gains.map(impactLabel).join(' · ') || 'нет';
    const losses = impact.losses.map(impactLabel).join(' · ') || 'нет';
    return `<li><strong>${impact.name}</strong><span>Выигрыш: ${gains}</span><span>Потери: ${losses}</span></li>`;
  }).join('');
  return `<section class="recommendation"><h3>Рекомендуемая точечная замена</h3><p><b>${decisionLabel(recommendation.changedDecision.from)}</b> заменить на <b>${decisionLabel(recommendation.changedDecision.to)}</b>. Прирост неокруглённого Score: <b>+${recommendation.scoreDelta.toFixed(5)}</b>; стоимость сценария: <b>${recommendation.cost}</b> (${recommendation.costDelta >= 0 ? '+' : ''}${recommendation.costDelta}).</p><ul class="recommendation-impacts">${impactMarkup}</ul></section>`;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function factValue(fact) {
  if (typeof fact.value !== 'number') return escapeHtml(fact.value);
  const precision = Number.isInteger(fact.value) ? 0 : 5;
  return `${fact.value > 0 && /изменение|прирост|потер/.test(fact.label.toLowerCase()) ? '+' : ''}${fact.value.toFixed(precision)}${fact.unit ? ` ${escapeHtml(fact.unit)}` : ''}`;
}

function evidenceMarkup(factIds, factsById) {
  const facts = factIds.map((id) => factsById.get(id)).filter(Boolean);
  return `<details class="analysis-evidence"><summary>Показать расчётные факты (${facts.length})</summary><ul>${facts.map((fact) => `<li data-fact-id="${escapeHtml(fact.id)}"><span>${escapeHtml(fact.label)}</span><b>${factValue(fact)}</b></li>`).join('')}</ul></details>`;
}

function basicAnalysisMarkup(analysis, facts) {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  return `<section class="basic-analysis"><p class="analysis-label">${escapeHtml(analysis.label)} · доступен сразу после расчёта; не является прогнозом городских происшествий.</p>${analysis.sections.map((section) => `<section class="analysis-section"><h3>${escapeHtml(section.title)}</h3>${section.conclusions.map((conclusion) => `<article class="analysis-conclusion"><p>${escapeHtml(conclusion.text)}</p>${evidenceMarkup(conclusion.factIds, factsById)}</article>`).join('')}</section>`).join('')}</section>`;
}

function saveAcceptedResult(decisions, result) {
  try {
    localStorage.setItem(acceptedResultStorageKey, JSON.stringify({ decisions, result }));
  } catch {
    // The calculated result stays visible even when browser storage is unavailable.
  }
}

function savedAcceptedResult() {
  try {
    const saved = JSON.parse(localStorage.getItem(acceptedResultStorageKey));
    return saved?.result?.basicAnalysis && saved?.result?.facts && Array.isArray(saved.decisions) ? saved : null;
  } catch {
    return null;
  }
}

function renderAcceptedResult(result) {
  acceptedResult = result;
  const critical = result.criticalIndicators.length ? result.criticalIndicators.map((item) => `${item.districtName}: ${item.indicatorId} = ${item.value.toFixed(2)}`).join(' · ') : 'Нет';
  resultPanel.hidden = false;
  resultPanel.innerHTML = `<h3>Результат на конец Q8</h3><div class="result-summary"><span>Расход <b>${result.cost}</b></span><span>Astana Quality of Life Score <b>${result.score.toFixed(5)}</b></span><span>Прирост <b>${result.scoreDelta.toFixed(5)}</b></span><span>Средневзвешенный результат <b>${result.weightedAverage.toFixed(3)}</b></span></div><p>Самый слабый район: <b>${result.weakestDistrict.name}</b> (${result.weakestDistrict.score.toFixed(3)}). Критических показателей: <b>${result.criticalCount}</b> — ${critical}.</p><p>Активированные синергии:</p><ul>${result.synergies.length ? result.synergies.map((item) => `<li>${item.title}: ${item.indicatorId} +${item.bonus}</li>`).join('') : '<li>Нет</li>'}</ul><div class="result-districts">${result.districts.map((district) => `<div class="result-district"><strong>${district.name}<small>Оценка ${district.score.toFixed(3)}</small></strong><span>Показатели Q8<small>${Object.entries(district.indicators).map(([id, value]) => `${id}: ${value.toFixed(2)}`).join(' · ')}</small></span><span>Изменения<small>${Object.entries(district.changes).filter(([, value]) => value !== 0).map(([id, value]) => `${id}: ${value > 0 ? '+' : ''}${value.toFixed(2)}`).join(' · ') || 'Нет изменений'}</small></span></div>`).join('')}</div>${basicAnalysisMarkup(result.basicAnalysis, result.facts)}${recommendationMarkup(result.recommendation)}`;
  document.querySelectorAll('[data-add-measure], [data-remove]').forEach((element) => { element.disabled = true; });
  accept.disabled = true;
  draftMessage.textContent = 'Попытка принята и больше не изменяется.';
  window.QalaMap.update({ decisions: draft, validation: { cost: result.cost, errors: [] }, result });
}

function localErrors() {
  const errors = [];
  if (draft.length !== 5) errors.push('Нужно выбрать ровно пять решений.');
  if (new Set(draft.map((item) => item.measureId)).size !== draft.length) errors.push('Мероприятия нельзя повторять.');
  if (draft.reduce((sum, item) => sum + measureOf(item.measureId).cost, 0) > 100) errors.push('Расход превышает бюджет 100.');
  const directions = {};
  draft.forEach((item) => { const direction = measureOf(item.measureId).direction; directions[direction] = (directions[direction] || 0) + 1; });
  if (Object.values(directions).some((count) => count > 2)) errors.push('В одном направлении нельзя выбрать более двух мероприятий.');
  if (draft.some((item) => measureOf(item.measureId).scope === 'district' && !item.districtId)) errors.push('Для районного мероприятия выберите район.');
  if (draft.some((item) => measureOf(item.measureId).scope === 'city' && item.districtId)) errors.push('Городское мероприятие не требует района.');
  if (draft.some((item) => item.measureId === 'M1') && draft.some((item) => item.measureId === 'M3')) errors.push('M1 и M3 несовместимы.');
  [['M4', 'M7'], ['M5', 'M13']].forEach(([left, right]) => {
    const first = draft.find((item) => item.measureId === left);
    const second = draft.find((item) => item.measureId === right);
    if (first && second && first.districtId === second.districtId) errors.push(`${left} и ${right} нельзя выбрать в одном районе.`);
  });
  return errors;
}

function renderDraft() {
  const cost = draft.reduce((sum, item) => sum + measureOf(item.measureId).cost, 0);
  document.querySelector('#draft-count').textContent = `${draft.length}/5`;
  document.querySelector('#draft-cost').textContent = cost;
  document.querySelector('#draft-remaining').textContent = 100 - cost;
  draftList.innerHTML = draft.map((item, index) => `<li class="draft-item"><span><b>${item.measureId}</b> · ${item.districtName || 'Весь город'}</span><button type="button" data-remove="${index}">Удалить</button></li>`).join('');
  const errors = localErrors();
  draftMessage.textContent = errors.join(' ');
  accept.disabled = errors.length > 0;
  window.QalaMap.update({ decisions: draft, validation: { cost, errors }, result: acceptedResult });
}

function addMeasure(button) {
  const measureId = button.dataset.addMeasure;
  const card = button.closest('[data-measure]');
  const select = card.querySelector('[data-district-for]');
  const districtId = select ? select.value : null;
  const districtName = select?.selectedOptions[0]?.textContent;
  if (measureOf(measureId).scope === 'district' && !districtId) {
    draftMessage.textContent = 'Сначала выберите район для мероприятия.';
    return;
  }
  if (draft.some((item) => item.measureId === measureId)) {
    draftMessage.textContent = 'Это мероприятие уже выбрано.';
    return;
  }
  draft.push({ measureId, districtId, districtName });
  renderDraft();
}

async function acceptScenario() {
  accept.disabled = true;
  draftMessage.textContent = 'Расчёт результата на Q8…';
  const response = await fetch('/api/scenarios/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decisions: draft }) });
  const payload = await response.json();
  if (!response.ok) {
    draftMessage.textContent = payload.errors.map((item) => item.message).join(' ');
    renderDraft();
    return;
  }
  saveAcceptedResult(payload.decisions, payload.result);
  renderAcceptedResult(payload.result);
}

search.addEventListener('input', filterMeasures);
scope.addEventListener('change', filterMeasures);
document.querySelectorAll('[data-add-measure]').forEach((button) => button.addEventListener('click', () => addMeasure(button)));
draftList.addEventListener('click', (event) => { const button = event.target.closest('[data-remove]'); if (button) { draft.splice(Number(button.dataset.remove), 1); renderDraft(); } });
accept.addEventListener('click', acceptScenario);
renderDraft();
const savedResult = savedAcceptedResult();
if (savedResult) {
  draft.push(...savedResult.decisions.map((decision) => ({
    ...decision,
    districtName: document.querySelector(`[data-district-for="${decision.measureId}"] option[value="${decision.districtId}"]`)?.textContent,
  })));
  renderDraft();
  renderAcceptedResult(savedResult.result);
}

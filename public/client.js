const text = window.qalaI18n;
const locale = window.qalaLocale;
const stateKey = 'qala-locale-switch-v1';
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
const attemptList = document.querySelector('#attempt-list');
const attemptHistoryEmpty = document.querySelector('#attempt-history-empty');
const attemptComparison = document.querySelector('#attempt-comparison');
const attemptHistory = window.QalaHistory.createAttemptHistory(window.localStorage);
const selectedAttemptIds = new Set();
let draftAccepted = false;

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

function districtNameFor(decision) {
  if (!decision.districtId) return null;
  const select = [...document.querySelectorAll('[data-district-for]')].find((item) => item.dataset.districtFor === decision.measureId);
  const option = [...(select?.options ?? [])].find((item) => item.value === decision.districtId);
  return option?.textContent ?? decision.districtId;
}

function decisionLabel(decision) { return `${decision.measureId} · ${districtNameFor(decision) || text.wholeCity}`; }
function impactLabel(change) { return `${change.indicatorId}: ${change.delta > 0 ? '+' : ''}${change.delta.toFixed(2)}`; }
function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }

function recommendationMarkup(recommendation) {
  if (!recommendation.found) return `<section class="recommendation"><h3>${text.recommendation}</h3><p>${text.noRecommendation}</p></section>`;
  const impacts = recommendation.impacts.map((impact) => `<li><strong>${impact.name}</strong><span>${text.gain}: ${impact.gains.map(impactLabel).join(' · ') || text.none}</span><span>${text.losses}: ${impact.losses.map(impactLabel).join(' · ') || text.none}</span></li>`).join('');
  return `<section class="recommendation"><h3>${text.recommendation}</h3><p><b>${decisionLabel(recommendation.changedDecision.from)}</b> ${text.replace} <b>${decisionLabel(recommendation.changedDecision.to)}</b>. ${text.scoreIncrease}: <b>+${recommendation.scoreDelta.toFixed(5)}</b>; ${text.scenarioCost}: <b>${recommendation.cost}</b> (${recommendation.costDelta >= 0 ? '+' : ''}${recommendation.costDelta}).</p><ul class="recommendation-impacts">${impacts}</ul></section>`;
}

function factValue(fact) {
  if (typeof fact.value !== 'number') return escapeHtml(fact.value);
  const precision = Number.isInteger(fact.value) ? 0 : 5;
  return `${fact.value > 0 && /изменение|прирост|потер/.test(fact.label.toLowerCase()) ? '+' : ''}${fact.value.toFixed(precision)}${fact.unit ? ` ${escapeHtml(fact.unit)}` : ''}`;
}

function basicAnalysisMarkup(analysis, facts) {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const evidence = (factIds) => { const matching = factIds.map((id) => factsById.get(id)).filter(Boolean); return `<details class="analysis-evidence"><summary>Показать расчётные факты (${matching.length})</summary><ul>${matching.map((fact) => `<li data-fact-id="${escapeHtml(fact.id)}"><span>${escapeHtml(fact.label)}</span><b>${factValue(fact)}</b></li>`).join('')}</ul></details>`; };
  return `<section class="basic-analysis"><p class="analysis-label">${escapeHtml(analysis.label)} · доступен сразу после расчёта; не является прогнозом городских происшествий.</p>${analysis.sections.map((section) => `<section class="analysis-section"><h3>${escapeHtml(section.title)}</h3>${section.conclusions.map((conclusion) => `<article class="analysis-conclusion"><p>${escapeHtml(conclusion.text)}</p>${evidence(conclusion.factIds)}</article>`).join('')}</section>`).join('')}</section>`;
}

function resultMarkup(result) {
  const critical = result.criticalIndicators.length ? result.criticalIndicators.map((item) => `${item.districtName}: ${item.indicatorId} = ${item.value.toFixed(2)}`).join(' · ') : text.none;
  const analysis = result.basicAnalysis && result.facts ? basicAnalysisMarkup(result.basicAnalysis, result.facts) : '';
  return `<h3>${text.result}</h3><div class="result-summary"><span>${text.spent} <b>${result.cost}</b></span><span>${text.score} <b>${result.score.toFixed(5)}</b></span><span>${text.increase} <b>${result.scoreDelta.toFixed(5)}</b></span><span>${text.weighted} <b>${result.weightedAverage.toFixed(3)}</b></span></div><p>${text.weakest}: <b>${result.weakestDistrict.name}</b> (${result.weakestDistrict.score.toFixed(3)}). ${text.criticalCount}: <b>${result.criticalCount}</b> — ${critical}.</p><p>${text.synergies}:</p><ul>${result.synergies.length ? result.synergies.map((item) => `<li>${item.title}: ${item.indicatorId} +${item.bonus}</li>`).join('') : `<li>${text.none}</li>`}</ul><div class="result-districts">${result.districts.map((district) => `<div class="result-district"><strong>${district.name}<small>${text.scoreLabel} ${district.score.toFixed(3)}</small></strong><span>${text.q8Indicators}<small>${Object.entries(district.indicators).map(([id, value]) => `${id}: ${value.toFixed(2)}`).join(' · ')}</small></span><span>${text.changes}<small>${Object.entries(district.changes).filter(([, value]) => value !== 0).map(([id, value]) => `${id}: ${value > 0 ? '+' : ''}${value.toFixed(2)}`).join(' · ') || text.noChanges}</small></span></div>`).join('')}</div>${analysis}${recommendationMarkup(result.recommendation)}`;
}

function showResult(result) { resultPanel.hidden = false; resultPanel.innerHTML = resultMarkup(result); }
function saveAcceptedResult(decisions, result) { try { localStorage.setItem(acceptedResultStorageKey, JSON.stringify({ decisions, result })); } catch { /* Result remains visible without storage. */ } }
function savedAcceptedResult() { try { const saved = JSON.parse(localStorage.getItem(acceptedResultStorageKey)); return saved?.result?.basicAnalysis && saved?.result?.facts ? saved.result : null; } catch { return null; } }
function renderAcceptedResult(result) { showResult(result); draftAccepted = true; renderDraft(); draftMessage.textContent = text.accepted; }
function signed(value, digits = 2) { return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`; }

function renderComparison(attempts) {
  const selected = attempts.filter((attempt) => selectedAttemptIds.has(attempt.id));
  if (selected.length !== 2) { attemptComparison.hidden = true; attemptComparison.innerHTML = ''; return; }
  const comparison = window.QalaHistory.compareAttempts(selected[0], selected[1]);
  const districts = comparison.districts.map((district) => `<li><b>${escapeHtml(district.name)}</b>: ${Object.entries(district.changeDeltas).filter(([, value]) => value !== 0).map(([id, value]) => `${id}: ${signed(value)}`).join(' · ') || text.noChanges}</li>`).join('');
  attemptComparison.hidden = false;
  attemptComparison.innerHTML = `<h3>Сравнение попыток</h3><div class="result-summary"><span>Первая: <b>${comparison.left.cost}</b> ${text.unit} · Score <b>${comparison.left.score.toFixed(5)}</b></span><span>Вторая: <b>${comparison.right.cost}</b> ${text.unit} · Score <b>${comparison.right.score.toFixed(5)}</b></span><span>Разница: ${text.spent.toLowerCase()} <b>${signed(comparison.costDelta, 0)}</b> · Score <b>${signed(comparison.scoreDelta, 5)}</b></span></div><p><b>Решения первой:</b> ${escapeHtml(comparison.left.decisions.map(decisionLabel).join(', '))}</p><p><b>Решения второй:</b> ${escapeHtml(comparison.right.decisions.map(decisionLabel).join(', '))}</p><p><b>Разница изменений показателей районов (вторая − первая):</b></p><ul>${districts}</ul>`;
}

function renderAttemptHistory() {
  const attempts = attemptHistory.list();
  attemptHistoryEmpty.hidden = attempts.length !== 0;
  attemptList.innerHTML = attempts.map((attempt, index) => `<li class="draft-item"><span><b>Попытка ${index + 1}</b> · ${text.spent.toLowerCase()} ${attempt.result.cost} · Score ${attempt.result.score.toFixed(5)}</span><span><button type="button" data-open-attempt="${index}">Открыть результат</button><button type="button" data-copy-attempt="${index}">Создать редактируемую копию</button><label><input type="checkbox" data-compare-attempt="${index}"${selectedAttemptIds.has(attempt.id) ? ' checked' : ''}> Сравнить</label></span></li>`).join('');
  renderComparison(attempts);
}

function copyAttempt(attempt) {
  draft.splice(0, draft.length, ...attempt.decisions.map((decision) => ({ measureId: decision.measureId, districtId: decision.districtId, districtName: districtNameFor(decision) })));
  draftAccepted = false;
  resultPanel.hidden = true;
  resultPanel.innerHTML = '';
  renderDraft();
  draftMessage.textContent = 'Создана редактируемая копия принятого сценария. Бюджет снова равен 100; исходная попытка не изменена.';
}

function localErrors() {
  const errors = [];
  if (draft.length !== 5) errors.push(text.exactFive);
  if (new Set(draft.map((item) => item.measureId)).size !== draft.length) errors.push(text.noDuplicates);
  if (draft.reduce((sum, item) => sum + measureOf(item.measureId).cost, 0) > 100) errors.push(text.overBudget);
  const directions = {};
  draft.forEach((item) => { const direction = measureOf(item.measureId).direction; directions[direction] = (directions[direction] || 0) + 1; });
  if (Object.values(directions).some((count) => count > 2)) errors.push(text.directionLimit);
  if (draft.some((item) => measureOf(item.measureId).scope === 'district' && !item.districtId)) errors.push(text.districtRequired);
  if (draft.some((item) => measureOf(item.measureId).scope === 'city' && item.districtId)) errors.push(text.cityNoDistrict);
  if (draft.some((item) => item.measureId === 'M1') && draft.some((item) => item.measureId === 'M3')) errors.push(`M1 ${text.incompatible} M3.`);
  [['M4', 'M7'], ['M5', 'M13']].forEach(([left, right]) => { const first = draft.find((item) => item.measureId === left); const second = draft.find((item) => item.measureId === right); if (first && second && first.districtId === second.districtId) errors.push(`${left} ${text.sameDistrict} ${right}.`); });
  return errors;
}

function renderDraft() {
  const cost = draft.reduce((sum, item) => sum + measureOf(item.measureId).cost, 0);
  document.querySelector('#draft-count').textContent = `${draft.length}/5`;
  document.querySelector('#draft-cost').textContent = cost;
  document.querySelector('#draft-remaining').textContent = 100 - cost;
  draftList.innerHTML = draft.map((item, index) => `<li class="draft-item"><span><b>${item.measureId}</b> · ${item.districtName || districtNameFor(item) || text.wholeCity}</span><button type="button" data-remove="${index}"${draftAccepted ? ' disabled' : ''}>${text.remove}</button></li>`).join('');
  const errors = localErrors();
  draftMessage.textContent = errors.join(' ');
  accept.disabled = draftAccepted || errors.length > 0;
  document.querySelectorAll('[data-add-measure]').forEach((button) => { button.disabled = draftAccepted; });
}

function addMeasure(button) {
  if (draftAccepted) return;
  const measureId = button.dataset.addMeasure;
  const card = button.closest('[data-measure]');
  const select = card.querySelector('[data-district-for]');
  const districtId = select ? select.value : null;
  const districtName = select?.selectedOptions[0]?.textContent;
  if (measureOf(measureId).scope === 'district' && !districtId) { draftMessage.textContent = text.selectDistrictFirst; return; }
  if (draft.some((item) => item.measureId === measureId)) { draftMessage.textContent = text.alreadySelected; return; }
  draft.push({ measureId, districtId, districtName });
  renderDraft();
}

async function acceptScenario(restoring = false) {
  if (draftAccepted && !restoring) return;
  accept.disabled = true;
  draftMessage.textContent = text.calculating;
  const response = await fetch('/api/scenarios/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decisions: draft, locale }) });
  const payload = await response.json();
  if (!response.ok) { draftMessage.textContent = payload.errors.map((item) => item.message).join(' '); renderDraft(); return; }
  saveAcceptedResult(payload.decisions, payload.result);
  showResult(payload.result);
  draftAccepted = true;
  renderDraft();
  if (!restoring) { try { attemptHistory.append(payload); renderAttemptHistory(); draftMessage.textContent = 'Попытка принята и сохранена в истории. Исходная запись больше не изменяется.'; } catch { draftMessage.textContent = text.accepted; } }
}

function restoreAfterLocaleSwitch() {
  const saved = sessionStorage.getItem(stateKey);
  if (!saved) return false;
  sessionStorage.removeItem(stateKey);
  try {
    const state = JSON.parse(saved);
    draft.push(...state.decisions.map((item) => ({ measureId: item.measureId, districtId: item.districtId ?? null, districtName: districtNameFor(item) })));
    renderDraft();
    if (state.accepted) void acceptScenario(true);
    return true;
  } catch { return false; }
}

search.addEventListener('input', filterMeasures);
scope.addEventListener('change', filterMeasures);
document.querySelectorAll('[data-add-measure]').forEach((button) => button.addEventListener('click', () => addMeasure(button)));
draftList.addEventListener('click', (event) => { const button = event.target.closest('[data-remove]'); if (button && !draftAccepted) { draft.splice(Number(button.dataset.remove), 1); renderDraft(); } });
attemptList.addEventListener('click', (event) => { const open = event.target.closest('[data-open-attempt]'); const copy = event.target.closest('[data-copy-attempt]'); if (!open && !copy) return; const attempt = attemptHistory.list()[Number((open ?? copy).dataset.openAttempt ?? (open ?? copy).dataset.copyAttempt)]; if (!attempt) return; if (open) showResult(attempt.result); if (copy) copyAttempt(attempt); });
attemptList.addEventListener('change', (event) => { const checkbox = event.target.closest('[data-compare-attempt]'); if (!checkbox) return; const attempt = attemptHistory.list()[Number(checkbox.dataset.compareAttempt)]; if (!attempt) return; if (checkbox.checked) { if (selectedAttemptIds.size === 2) selectedAttemptIds.delete([...selectedAttemptIds][0]); selectedAttemptIds.add(attempt.id); } else selectedAttemptIds.delete(attempt.id); renderAttemptHistory(); });
accept.addEventListener('click', () => { void acceptScenario(); });
document.querySelector('#language-switch').addEventListener('click', (event) => { event.preventDefault(); sessionStorage.setItem(stateKey, JSON.stringify({ decisions: draft, accepted: draftAccepted })); window.location.assign(event.currentTarget.href); });
renderDraft();
renderAttemptHistory();
const restored = restoreAfterLocaleSwitch();
const savedResult = savedAcceptedResult();
if (!restored && savedResult) renderAcceptedResult(savedResult);

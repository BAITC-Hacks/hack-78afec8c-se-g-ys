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
let acceptedScenario = false;

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

function districtName(id) {
  return document.querySelector(`[data-district-for] option[value="${id}"]`)?.textContent || id;
}

function decisionLabel(decision) {
  return `${decision.measureId} · ${decision.districtId ? districtName(decision.districtId) : text.wholeCity}`;
}

function impactLabel(change) {
  return `${change.indicatorId}: ${change.delta > 0 ? '+' : ''}${change.delta.toFixed(2)}`;
}

function recommendationMarkup(recommendation) {
  if (!recommendation.found) return `<section class="recommendation"><h3>${text.recommendation}</h3><p>${text.noRecommendation}</p></section>`;
  const impactMarkup = recommendation.impacts.map((impact) => {
    const gains = impact.gains.map(impactLabel).join(' · ') || text.none;
    const losses = impact.losses.map(impactLabel).join(' · ') || text.none;
    return `<li><strong>${impact.name}</strong><span>${text.gain}: ${gains}</span><span>${text.losses}: ${losses}</span></li>`;
  }).join('');
  return `<section class="recommendation"><h3>${text.recommendation}</h3><p><b>${decisionLabel(recommendation.changedDecision.from)}</b> ${text.replace} <b>${decisionLabel(recommendation.changedDecision.to)}</b>. ${text.scoreIncrease}: <b>+${recommendation.scoreDelta.toFixed(5)}</b>; ${text.scenarioCost}: <b>${recommendation.cost}</b> (${recommendation.costDelta >= 0 ? '+' : ''}${recommendation.costDelta}).</p><ul class="recommendation-impacts">${impactMarkup}</ul></section>`;
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
  [['M4', 'M7'], ['M5', 'M13']].forEach(([left, right]) => {
    const first = draft.find((item) => item.measureId === left);
    const second = draft.find((item) => item.measureId === right);
    if (first && second && first.districtId === second.districtId) errors.push(`${left} ${text.sameDistrict} ${right}.`);
  });
  return errors;
}

function renderDraft() {
  const cost = draft.reduce((sum, item) => sum + measureOf(item.measureId).cost, 0);
  document.querySelector('#draft-count').textContent = `${draft.length}/5`;
  document.querySelector('#draft-cost').textContent = cost;
  document.querySelector('#draft-remaining').textContent = 100 - cost;
  draftList.innerHTML = draft.map((item, index) => `<li class="draft-item"><span><b>${item.measureId}</b> · ${item.districtId ? districtName(item.districtId) : text.wholeCity}</span><button type="button" data-remove="${index}" ${acceptedScenario ? 'disabled' : ''}>${text.remove}</button></li>`).join('');
  const errors = localErrors();
  draftMessage.textContent = errors.join(' ');
  accept.disabled = errors.length > 0 || acceptedScenario;
  if (acceptedScenario) document.querySelectorAll('[data-add-measure]').forEach((element) => { element.disabled = true; });
}

function addMeasure(button) {
  const measureId = button.dataset.addMeasure;
  const card = button.closest('[data-measure]');
  const select = card.querySelector('[data-district-for]');
  const districtId = select ? select.value : null;
  if (measureOf(measureId).scope === 'district' && !districtId) { draftMessage.textContent = text.selectDistrictFirst; return; }
  if (draft.some((item) => item.measureId === measureId)) { draftMessage.textContent = text.alreadySelected; return; }
  draft.push({ measureId, districtId });
  renderDraft();
}

function renderResult(result) {
  const critical = result.criticalIndicators.length ? result.criticalIndicators.map((item) => `${item.districtName}: ${item.indicatorId} = ${item.value.toFixed(2)}`).join(' · ') : text.none;
  resultPanel.hidden = false;
  resultPanel.innerHTML = `<h3>${text.result}</h3><div class="result-summary"><span>${text.spent} <b>${result.cost}</b></span><span>${text.score} <b>${result.score.toFixed(5)}</b></span><span>${text.increase} <b>${result.scoreDelta.toFixed(5)}</b></span><span>${text.weighted} <b>${result.weightedAverage.toFixed(3)}</b></span></div><p>${text.weakest}: <b>${result.weakestDistrict.name}</b> (${result.weakestDistrict.score.toFixed(3)}). ${text.criticalCount}: <b>${result.criticalCount}</b> — ${critical}.</p><p>${text.synergies}:</p><ul>${result.synergies.length ? result.synergies.map((item) => `<li>${item.title}: ${item.indicatorId} +${item.bonus}</li>`).join('') : `<li>${text.none}</li>`}</ul><div class="result-districts">${result.districts.map((district) => `<div class="result-district"><strong>${district.name}<small>${text.scoreLabel} ${district.score.toFixed(3)}</small></strong><span>${text.q8Indicators}<small>${Object.entries(district.indicators).map(([id, value]) => `${id}: ${value.toFixed(2)}`).join(' · ')}</small></span><span>${text.changes}<small>${Object.entries(district.changes).filter(([, value]) => value !== 0).map(([id, value]) => `${id}: ${value > 0 ? '+' : ''}${value.toFixed(2)}`).join(' · ') || text.noChanges}</small></span></div>`).join('')}</div>${recommendationMarkup(result.recommendation)}`;
}

async function acceptScenario(restoring = false) {
  accept.disabled = true;
  draftMessage.textContent = text.calculating;
  const response = await fetch('/api/scenarios/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decisions: draft, locale }) });
  const payload = await response.json();
  if (!response.ok) { draftMessage.textContent = payload.errors.map((item) => item.message).join(' '); renderDraft(); return; }
  acceptedScenario = true;
  renderResult(payload.result);
  renderDraft();
  draftMessage.textContent = text.accepted;
  if (!restoring) sessionStorage.removeItem(stateKey);
}

function restoreAfterLocaleSwitch() {
  const saved = sessionStorage.getItem(stateKey);
  if (!saved) return;
  sessionStorage.removeItem(stateKey);
  try {
    const state = JSON.parse(saved);
    draft.push(...state.decisions.map((item) => ({ measureId: item.measureId, districtId: item.districtId ?? null })));
    acceptedScenario = Boolean(state.accepted);
    renderDraft();
    if (acceptedScenario) { acceptedScenario = false; void acceptScenario(true); }
  } catch { sessionStorage.removeItem(stateKey); }
}

search.addEventListener('input', filterMeasures);
scope.addEventListener('change', filterMeasures);
document.querySelectorAll('[data-add-measure]').forEach((button) => button.addEventListener('click', () => addMeasure(button)));
draftList.addEventListener('click', (event) => { const button = event.target.closest('[data-remove]'); if (button) { draft.splice(Number(button.dataset.remove), 1); renderDraft(); } });
accept.addEventListener('click', () => { void acceptScenario(); });
document.querySelector('#language-switch').addEventListener('click', (event) => {
  event.preventDefault();
  sessionStorage.setItem(stateKey, JSON.stringify({ decisions: draft, accepted: acceptedScenario }));
  window.location.assign(event.currentTarget.href);
});
renderDraft();
restoreAfterLocaleSwitch();

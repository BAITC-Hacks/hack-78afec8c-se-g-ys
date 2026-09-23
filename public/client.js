const text = window.qalaI18n;
const locale = window.qalaLocale;
const analysisText = window.qalaAnalysisText;
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
const attemptList = document.querySelector('#attempt-list');
const attemptHistoryEmpty = document.querySelector('#attempt-history-empty');
const attemptComparison = document.querySelector('#attempt-comparison');
const attemptHistory = window.QalaHistory.createAttemptHistory(window.localStorage);
let acceptedScenario = false;
let currentAttempt = null;
let activeAnalysisContext = null;

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

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
  draftList.innerHTML = draft.map((item, index) => `<li class="draft-item"><span><b>${item.measureId}</b> · ${item.districtId ? districtName(item.districtId) : text.wholeCity}</span><button type="button" data-remove="${index}"${acceptedScenario ? ' disabled' : ''}>${text.remove}</button></li>`).join('');
  const errors = localErrors();
  draftMessage.textContent = errors.join(' ');
  accept.disabled = acceptedScenario || errors.length > 0;
  document.querySelectorAll('[data-add-measure]').forEach((button) => { button.disabled = acceptedScenario; });
}

function addMeasure(button) {
  if (acceptedScenario) return;
  const measureId = button.dataset.addMeasure;
  const card = button.closest('[data-measure]');
  const select = card.querySelector('[data-district-for]');
  const districtId = select ? select.value : null;
  if (measureOf(measureId).scope === 'district' && !districtId) { draftMessage.textContent = text.selectDistrictFirst; return; }
  if (draft.some((item) => item.measureId === measureId)) { draftMessage.textContent = text.alreadySelected; return; }
  draft.push({ measureId, districtId });
  renderDraft();
}

function analysisMarkup(analysis, error) {
  const facts = currentAttempt?.result?.facts || [];
  const factById = new Map(facts.map((fact) => [fact.id, fact]));
  const sections = (analysis.sections || []).map((section) => `<article class="analysis-section"><h4>${escapeHtml(section.title)}</h4><ul>${(section.conclusions || []).map((conclusion) => `<li>${escapeHtml(conclusion.text)}<details class="analysis-evidence"><summary>${analysisText.evidence}</summary>${conclusion.factIds.map((factId) => { const fact = factById.get(factId); return `<span data-fact-id="${escapeHtml(factId)}">${escapeHtml(fact?.label || factId)}: ${escapeHtml(fact?.value ?? '')} ${escapeHtml(fact?.unit || '')}</span>`; }).join('<br>')}</details></li>`).join('')}</ul></article>`).join('');
  const statusMessage = error ? `${escapeHtml(error.message)} <button type="button" data-retry-analysis>${analysisText.retry}</button>` : (analysis.kind === 'ai' ? '' : analysisText.pending);
  return `<section class="analysis-panel" id="ai-analysis"><h3>${escapeHtml(analysis.label)}</h3><p>${statusMessage}</p><div class="analysis-sections">${sections}</div></section>`;
}

function renderAnalysis(analysis, error = null) {
  const panel = document.querySelector('#ai-analysis');
  if (panel) panel.outerHTML = analysisMarkup(analysis, error);
}

function renderResult(result) {
  const critical = result.criticalIndicators.length ? result.criticalIndicators.map((item) => `${item.districtName}: ${item.indicatorId} = ${item.value.toFixed(2)}`).join(' · ') : text.none;
  resultPanel.hidden = false;
  resultPanel.innerHTML = `<h3>${text.result}</h3><div class="result-summary"><span>${text.spent} <b>${result.cost}</b></span><span>${text.score} <b>${result.score.toFixed(5)}</b></span><span>${text.increase} <b>${result.scoreDelta.toFixed(5)}</b></span><span>${text.weighted} <b>${result.weightedAverage.toFixed(3)}</b></span></div><p>${text.weakest}: <b>${escapeHtml(result.weakestDistrict.name)}</b> (${result.weakestDistrict.score.toFixed(3)}). ${text.criticalCount}: <b>${result.criticalCount}</b> — ${escapeHtml(critical)}.</p><p>${text.synergies}: ${result.synergies.length ? result.synergies.map((item) => `${escapeHtml(item.title)}: ${item.indicatorId} +${item.bonus}`).join(' · ') : text.none}</p><div id="ai-analysis"></div>`;
  renderAnalysis(result.basicAnalysis);
}

function isCurrentAnalysisContext(context) {
  return activeAnalysisContext?.attemptId === context.attemptId && activeAnalysisContext?.locale === context.locale;
}

async function requestAnalysis(attemptId, requestedLocale = locale) {
  const context = { attemptId, locale: requestedLocale };
  activeAnalysisContext = context;
  const saved = attemptHistory.get(attemptId)?.analyses?.[requestedLocale];
  if (saved) {
    if (isCurrentAnalysisContext(context)) renderAnalysis(saved);
    return saved;
  }
  try {
    const response = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: requestedLocale }) });
    const outcome = await response.json();
    if (outcome.analysis) {
      if (outcome.status === 'ready') {
        const savedAttempt = attemptHistory.saveAnalysis(attemptId, requestedLocale, outcome.analysis);
        if (currentAttempt?.id === attemptId) currentAttempt = savedAttempt;
        localStorage.setItem('qala-last-attempt', attemptId);
      }
      if (currentAttempt?.id === attemptId && isCurrentAnalysisContext(context)) renderAnalysis(outcome.analysis, outcome.status === 'fallback' ? outcome.error : null);
    }
    return outcome.analysis;
  } catch (error) {
    if (isCurrentAnalysisContext(context) && currentAttempt) renderAnalysis(currentAttempt.result.basicAnalysis, { code: 'network_error', message: error.message || 'AI analysis is unavailable' });
    return null;
  }
}

function renderAttemptHistory() {
  const attempts = attemptHistory.list();
  attemptHistoryEmpty.hidden = attempts.length > 0;
  attemptList.innerHTML = attempts.map((attempt) => `<li class="draft-item"><span><b>${escapeHtml(attempt.id)}</b> · ${attempt.acceptedAt}</span><span class="attempt-actions"><button type="button" data-open-attempt="${escapeHtml(attempt.id)}">${analysisText.open}</button><button type="button" data-copy-attempt="${escapeHtml(attempt.id)}">${analysisText.copy}</button><button type="button" data-compare-attempt="${escapeHtml(attempt.id)}">${analysisText.comparison}</button></span></li>`).join('');
}

function openAttempt(attemptId) {
  const attempt = attemptHistory.get(attemptId);
  if (!attempt) return;
  currentAttempt = attempt;
  acceptedScenario = true;
  activeAnalysisContext = { attemptId, locale };
  draft.splice(0, draft.length, ...attempt.decisions.map((item) => ({ ...item })));
  renderDraft();
  renderResult(attempt.result);
  const saved = attempt.analyses?.[locale];
  if (saved) renderAnalysis(saved);
  else void requestAnalysis(attempt.id);
}

function copyAttempt(attemptId) {
  const attempt = attemptHistory.get(attemptId);
  if (!attempt) return;
  currentAttempt = null;
  acceptedScenario = false;
  draft.splice(0, draft.length, ...attempt.decisions.map((item) => ({ ...item })));
  renderDraft();
  draftMessage.textContent = text.draftHelp;
}

function acceptScenario() {
  if (acceptedScenario) return;
  acceptedScenario = true;
  accept.disabled = true;
  draftMessage.textContent = text.calculating;
  const attemptId = globalThis.crypto?.randomUUID?.() || `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  fetch('/api/scenarios/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId, decisions: draft, locale }) })
    .then(async (response) => ({ response, payload: await response.json() }))
    .then(({ response, payload }) => {
      if (!response.ok) { acceptedScenario = false; draftMessage.textContent = payload.errors.map((item) => item.message).join(' '); renderDraft(); return; }
      currentAttempt = attemptHistory.append(payload);
      localStorage.setItem('qala-last-attempt', currentAttempt.id);
      renderResult(currentAttempt.result);
      renderDraft();
      draftMessage.textContent = text.accepted;
      renderAttemptHistory();
      void requestAnalysis(currentAttempt.id, locale);
    })
    .catch((error) => { acceptedScenario = false; draftMessage.textContent = error.message || 'Request failed'; renderDraft(); });
}

function restoreAfterLocaleSwitch() {
  const saved = sessionStorage.getItem(stateKey);
  if (!saved) return;
  sessionStorage.removeItem(stateKey);
  try {
    const state = JSON.parse(saved);
    if (state.accepted && state.attemptId && attemptHistory.get(state.attemptId)) openAttempt(state.attemptId);
    else { draft.push(...(state.decisions || []).map((item) => ({ ...item }))); acceptedScenario = false; renderDraft(); }
  } catch { sessionStorage.removeItem(stateKey); }
}

search.addEventListener('input', filterMeasures);
scope.addEventListener('change', filterMeasures);
document.querySelectorAll('[data-add-measure]').forEach((button) => button.addEventListener('click', () => addMeasure(button)));
draftList.addEventListener('click', (event) => { const button = event.target.closest('[data-remove]'); if (button) { draft.splice(Number(button.dataset.remove), 1); renderDraft(); } });
attemptList.addEventListener('click', (event) => {
  const open = event.target.closest('[data-open-attempt]');
  const copy = event.target.closest('[data-copy-attempt]');
  if (open) openAttempt(open.dataset.openAttempt);
  if (copy) copyAttempt(copy.dataset.copyAttempt);
});
resultPanel.addEventListener('click', (event) => { if (event.target.closest('[data-retry-analysis]') && currentAttempt) void requestAnalysis(currentAttempt.id, locale); });
accept.addEventListener('click', acceptScenario);
document.querySelector('#language-switch').addEventListener('click', (event) => {
  event.preventDefault();
  sessionStorage.setItem(stateKey, JSON.stringify({ decisions: draft, accepted: acceptedScenario, attemptId: currentAttempt?.id || null }));
  window.location.assign(event.currentTarget.href);
});
renderDraft();
renderAttemptHistory();
restoreAfterLocaleSwitch();

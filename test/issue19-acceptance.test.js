const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createElement(dataset = {}) {
  return {
    dataset,
    hidden: false,
    disabled: false,
    innerHTML: '',
    textContent: '',
    value: '',
    listeners: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
  };
}

function loadClient() {
  const search = createElement();
  const scope = createElement();
  scope.value = 'all';
  const empty = createElement();
  const draftList = createElement();
  const draftMessage = createElement();
  const accept = createElement();
  const resultPanel = createElement();
  const draftCount = createElement();
  const draftCost = createElement();
  const draftRemaining = createElement();
  const attemptList = createElement();
  const attemptHistoryEmpty = createElement();
  const attemptComparison = createElement();
  const languageSwitch = createElement();
  const cards = [
    ['M2', 22], ['M6', 20], ['M12', 14], ['M14', 16],
  ].map(([id, cost]) => {
    const card = createElement({ measureId: id, cost: String(cost), direction: 'РЎРµСЂРІРёСЃС‹', scope: 'city' });
    const button = createElement({ addMeasure: id });
    button.closest = () => card;
    card.querySelector = () => null;
    return { card, button };
  });
  const elements = {
    '#search': search,
    '#scope': scope,
    '#empty': empty,
    '#draft-list': draftList,
    '#draft-message': draftMessage,
    '#accept-scenario': accept,
    '#result-panel': resultPanel,
    '#draft-count': draftCount,
    '#draft-cost': draftCost,
    '#draft-remaining': draftRemaining,
    '#attempt-list': attemptList,
    '#attempt-history-empty': attemptHistoryEmpty,
    '#attempt-comparison': attemptComparison,
    '#language-switch': languageSwitch,
  };
  const document = {
    querySelector(selector) {
      return elements[selector];
    },
    querySelectorAll(selector) {
      if (selector === '[data-measure]') return cards.map(({ card }) => card);
      if (selector === '[data-add-measure]') return cards.map(({ button }) => button);
      return [];
    },
  };
  const storage = new Map();
  let requests = 0;
  const window = {
    qalaI18n: {
      wholeCity: 'Р’РµСЃСЊ РіРѕСЂРѕРґ', remove: 'РЈРґР°Р»РёС‚СЊ', spent: 'Р Р°СЃС…РѕРґ',
      exactFive: 'РќСѓР¶РЅРѕ РІС‹Р±СЂР°С‚СЊ СЂРѕРІРЅРѕ РїСЏС‚СЊ СЂРµС€РµРЅРёР№.',
      noDuplicates: 'РњРµСЂРѕРїСЂРёСЏС‚РёСЏ РЅРµР»СЊР·СЏ РїРѕРІС‚РѕСЂСЏС‚СЊ.', overBudget: 'Р Р°СЃС…РѕРґ РїСЂРµРІС‹С€Р°РµС‚ Р±СЋРґР¶РµС‚ 100.',
      directionLimit: 'РќРµР»СЊР·СЏ РІС‹Р±СЂР°С‚СЊ Р±РѕР»СЊС€Рµ РґРІСѓС… РјРµСЂРѕРїСЂРёСЏС‚РёР№.', districtRequired: 'Р’С‹Р±РµСЂРёС‚Рµ СЂР°Р№РѕРЅ.', cityNoDistrict: 'Р Р°Р№РѕРЅ РЅРµ РЅСѓР¶РµРЅ.',
      incompatible: 'РЅРµСЃРѕРІРјРµСЃС‚РёРјС‹', sameDistrict: 'РЅРµР»СЊР·СЏ РІС‹Р±СЂР°С‚СЊ РІ РѕРґРЅРѕРј РґР°Р№РѕРЅРµ',
    },
    qalaLocale: 'ru',
    qalaAnalysisText: {},
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    QalaHistory: { createAttemptHistory: () => ({ list: () => [], append: () => {} }) },
    location: { assign() {} },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/client.js'), 'utf8'), {
    document,
    window,
    localStorage: window.localStorage,
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    fetch: async () => {
      requests += 1;
      return { ok: false, json: async () => ({ errors: [{ message: 'unexpected request' }] }) };
    },
  });
  return { cards, accept, resultPanel, draftMessage, get requests() { return requests; } };
}

test('invalid drafts cannot be submitted by the acceptance handler', async () => {
  const client = loadClient();
  client.cards.forEach(({ button }) => button.listeners.click());

  client.accept.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(client.requests, 0);
  assert.equal(client.resultPanel.hidden, true);
  assert.match(client.draftMessage.textContent, /РµС€РµРЅРёР№|five/i);
});

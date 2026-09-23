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
  const scope = createElement({});
  scope.value = 'all';
  const empty = createElement();
  const draftList = createElement();
  const draftMessage = createElement();
  const accept = createElement();
  const resultPanel = createElement();
  const draftCount = createElement();
  const draftCost = createElement();
  const draftRemaining = createElement();

  const cards = [
    ['M2', 22, 'city'],
    ['M6', 20, 'city'],
    ['M12', 14, 'city'],
    ['M14', 16, 'city'],
    ['M3', 30, 'district'],
  ].map(([id, cost, measureScope]) => {
    const card = createElement({ measureId: id, cost: String(cost), direction: id === 'M3' ? 'РўСЂР°РЅСЃРїРѕСЂС‚' : 'РЎРµСЂРІРёСЃС‹', scope: measureScope });
    const button = createElement({ addMeasure: id });
    button.closest = () => card;
    card.querySelector = (selector) => {
      if (selector !== '[data-district-for]') return null;
      return { value: 'nura', selectedOptions: [{ textContent: 'РќСѓСЂР°' }] };
    };
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
  };
  const document = {
    querySelector(selector) {
      return elements[selector];
    },
    querySelectorAll(selector) {
      if (selector === '[data-measure]') return cards.map(({ card }) => card);
      if (selector === '[data-add-measure]' || selector === '[data-add-measure], [data-remove]') return cards.map(({ button }) => button);
      return [];
    },
  };

  vm.runInNewContext(fs.readFileSync(require.resolve('../public/client.js'), 'utf8'), {
    document,
    fetch: async () => { throw new Error('fetch should not be called'); },
  });

  return { cards, draftCost, draftRemaining, draftList, draftMessage };
}

test('client refuses an addition that would exceed the shared budget', () => {
  const { cards, draftCost, draftRemaining, draftList, draftMessage } = loadClient();

  cards.slice(0, 4).forEach(({ button }) => button.listeners.click());
  assert.equal(draftCost.textContent, 72);
  assert.equal(draftRemaining.textContent, 28);

  cards[4].button.listeners.click();

  assert.equal(draftCost.textContent, 72);
  assert.equal(draftRemaining.textContent, 28);
  assert.equal((draftList.innerHTML.match(/class="draft-item"/g) || []).length, 4);
  assert.match(draftMessage.textContent, /100/);
});

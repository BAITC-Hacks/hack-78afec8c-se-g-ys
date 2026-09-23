const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');
const { openBrowser } = require('../support/browser');

test('page exposes five named SVG district controls and a whole-city reset', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const html = await (await fetch(`http://127.0.0.1:${server.address().port}/`)).text();
    assert.match(html, /<svg[^>]+aria-label="Карта районов"/);
    for (const id of ['esil', 'almaty', 'saryarka', 'baikonur', 'nura']) {
      assert.match(html, new RegExp(`data-map-district="${id}"`));
    }
    assert.match(html, /id="map-reset"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('district controls select and clear a district while keyboard focus stays on the map', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await openBrowser(`http://127.0.0.1:${server.address().port}/`);
    await browser.evaluate('document.querySelector("[data-map-district=nura]").focus()');
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.deepEqual(await browser.evaluate('({ selected: document.querySelector("[data-map-district=nura]").getAttribute("aria-pressed"), focus: document.activeElement.dataset.mapDistrict, detail: document.querySelector("#map-detail").textContent.includes("Нура") })'),
      { selected: 'true', focus: 'nura', detail: true });
    await browser.evaluate('document.querySelector("#map-reset").click()');
    assert.equal(await browser.evaluate('document.querySelector("[data-map-district=nura]").getAttribute("aria-pressed")'), 'false');
    await browser.evaluate('document.querySelector("[data-map-district=esil]").focus()');
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    assert.equal(await browser.evaluate('document.querySelector("[data-map-district=esil]").getAttribute("aria-pressed")'), 'true');
    const point = await browser.evaluate(`(() => { const box = document.querySelector('[data-map-district=nura] text').getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    assert.equal(await browser.evaluate('document.querySelector("[data-map-district=nura]").getAttribute("aria-pressed")'), 'true');
    for (const id of ['esil', 'almaty', 'saryarka', 'baikonur', 'nura']) {
      await browser.evaluate(`document.querySelector('[data-map-list-district=${id}]').click()`);
      assert.equal(await browser.evaluate(`document.querySelector('[data-map-district=${id}]').getAttribute('aria-pressed')`), 'true');
      assert.equal(await browser.evaluate('document.querySelector("#map-detail h3").textContent'),
        { esil: 'Есиль', almaty: 'Алматы', saryarka: 'Сарыарка', baikonur: 'Байконур', nura: 'Нура' }[id]);
    }
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('draft map keeps district and city-wide decisions distinct without revealing a Score', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await openBrowser(`http://127.0.0.1:${server.address().port}/`);
    await browser.evaluate('document.querySelector("[data-map-list-district=nura]").click(); document.querySelector("[data-district-for=M7]").value = "nura"; document.querySelector("[data-add-measure=M7]").click(); document.querySelector("[data-add-measure=M12]").click()');
    const nura = await browser.evaluate('document.querySelector("#map-detail").textContent');
    assert.match(nura, /Решения: 2\/5/);
    assert.match(nura, /Расход: 38/);
    assert.match(nura, /M7/);
    assert.match(nura, /M12/);
    assert.match(nura, /Состояние черновика/);
    assert.match(nura, /Критическое|Слабое|Стабильное/);
    assert.equal(await browser.evaluate('document.querySelector("[data-map-district=nura]").getAttribute("aria-pressed")'), 'true');
    assert.doesNotMatch(nura, /Score|Показатели на конец Q8/);
    await browser.evaluate('document.querySelector("[data-map-list-district=esil]").click()');
    const esil = await browser.evaluate('document.querySelector("#map-detail").textContent');
    assert.doesNotMatch(esil, /M7/);
    assert.match(esil, /M12/);
    await browser.evaluate('document.querySelector("#map-reset").click()');
    assert.match(await browser.evaluate('document.querySelector("#map-detail").textContent'), /M7[\s\S]*Нура/);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('accepted map shows the same Q8 district values and Score as the accepted result', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await openBrowser(`http://127.0.0.1:${server.address().port}/`);
    await browser.evaluate(`[
      ['M7', 'nura'], ['M8', 'nura'], ['M10', 'nura'], ['M12', null], ['M5', 'saryarka']
    ].forEach(([id, district]) => {
      if (district) document.querySelector('[data-district-for=' + id + ']').value = district;
      document.querySelector('[data-add-measure=' + id + ']').click();
    }); document.querySelector('#accept-scenario').click()`);
    await browser.waitFor(() => browser.evaluate('!document.querySelector("#result-panel").hidden'));
    await browser.evaluate('document.querySelector("[data-map-list-district=nura]").click()');
    const values = await browser.evaluate(`({
      map: [...document.querySelectorAll('#map-detail [data-map-indicator]')].map(item => [item.dataset.mapIndicator, item.querySelector('dd').textContent.match(/[-\\d.]+/)[0]]),
      result: document.querySelectorAll('#result-panel .result-district')[4].querySelectorAll('span small')[0].textContent,
      local: document.querySelector('#map-detail').textContent,
    })`);
    for (const [id, value] of values.map) assert.match(values.result, new RegExp(`${id}: ${value.replace('.', '\\.')}`));
    assert.match(values.local, /M7/);
    assert.match(values.local, /M8/);
    assert.match(values.local, /M10/);
    assert.match(values.local, /M12/);
    assert.doesNotMatch(values.local, /M5/);
    await browser.evaluate('document.querySelector("#map-reset").click()');
    const scores = await browser.evaluate(`({ map: document.querySelector('#map-detail').textContent,
      result: document.querySelector('#result-panel .result-summary').textContent })`);
    assert.match(scores.map, /56\.54307/);
    assert.match(scores.result, /56\.54307/);
    await browser.evaluate('document.querySelector("[data-map-list-district=nura]").click(); document.querySelector("[data-map-locale=kk]").click()');
    const kazakh = await browser.evaluate(`({ selected: document.querySelector('[data-map-district=nura]').getAttribute('aria-pressed'),
      detail: document.querySelector('#map-detail').textContent,
      result: document.querySelector('#result-panel .result-summary').textContent })`);
    assert.equal(kazakh.selected, 'true');
    assert.match(kazakh.detail, /Q8 соңындағы көрсеткіштер/);
    assert.match(kazakh.detail, /M12 · Өтініштердің бірыңғай цифрлық платформасы/);
    assert.match(kazakh.result, /56\.54307/);
    await browser.send('Page.reload');
    await browser.waitFor(() => browser.evaluate('document.readyState === "complete" && !document.querySelector("#result-panel").hidden && document.querySelector("#map-detail").textContent.includes("56.54307")'));
    const restored = await browser.evaluate('document.querySelector("#map-detail").textContent');
    assert.match(restored, /M7[\s\S]*Нура/);
    assert.match(restored, /M12/);
    assert.match(restored, /56\.54307/);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Kazakh map preserves draft decisions, district focus, and numbers', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await openBrowser(`http://127.0.0.1:${server.address().port}/`);
    await browser.evaluate('document.querySelector("[data-district-for=M7]").value = "nura"; document.querySelector("[data-add-measure=M7]").click(); document.querySelector("[data-add-measure=M12]").click(); document.querySelector("[data-map-district=nura]").dispatchEvent(new MouseEvent("click", { bubbles: true })); document.querySelector("[data-map-locale=kk]").click()');
    const state = await browser.evaluate(`({
      lang: document.querySelector('.map-section').lang,
      title: document.querySelector('#map-title').textContent,
      district: document.querySelector('[data-map-district=nura]').getAttribute('aria-label'),
      selected: document.querySelector('[data-map-district=nura]').getAttribute('aria-pressed'),
      legend: document.querySelector('#map-legend').textContent,
      detail: document.querySelector('#map-detail').textContent,
    })`);
    assert.equal(state.lang, 'kk');
    assert.equal(state.title, 'Бес аудан картасы');
    assert.match(state.district, /Нұра/);
    assert.equal(state.selected, 'true');
    assert.match(state.legend, /Күрделі/);
    assert.match(state.detail, /Жобаның күйі/);
    assert.match(state.detail, /Шығын: 38/);
    assert.match(state.detail, /M7 · Мектеп пен балабақша/);
    assert.match(state.detail, /M12 · Өтініштердің бірыңғай цифрлық платформасы/);
    assert.doesNotMatch(state.detail, /Нужно выбрать|Score/);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

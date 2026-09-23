(() => {
  const catalog = JSON.parse(document.querySelector('#map-data').textContent);
  const map = document.querySelector('#district-map');
  const detail = document.querySelector('#map-detail');
  const reset = document.querySelector('#map-reset');
  let locale = 'ru';
  let selected = null;
  let decisions = [];
  let validation = { cost: 0, errors: [] };
  let result = null;

  const kkDistricts = {
    esil: ['Есіл', 'Бай аудан, бірақ көпірлердегі кептеліс пен мектептердің толуы қиындық туғызады.'],
    almaty: ['Алматы', 'Тозған коммуналдық желілер мен кептелістер.'],
    saryarka: ['Сарыарқа', 'Жеке сектордан шыққан түтін мен көгалдандырудың жеткіліксіздігі.'],
    baikonur: ['Байқоңыр', 'Көрсеткіштері орташа, айқын теңгерімсіздігі жоқ аудан.'],
    nura: ['Нұра', 'Әлеуметтік сала мен көлік бойынша ең әлсіз аудан.'],
  };
  const kkIndicators = {
    T1: 'Жол кептелісінің аздығы', T2: 'Қоғамдық көлікке қолжетімділік',
    E1: 'Көгалдандыру', E2: 'Ауа сапасы', S1: 'Мектептер мен балабақшалар',
    S2: 'Емханалар мен алғашқы медициналық көмек', B1: 'Көше қауіпсіздігі',
    B2: 'Жол қозғалысының қауіпсіздігі', C1: 'Коммуналдық жүйелердің сенімділігі',
    C2: 'Тұрғындар өтініштерін шешу жылдамдығы',
  };
  const kkMeasures = {
    M1: 'Автобустарға арналған жолақтар', M2: 'Ақылды бағдаршамдар',
    M3: 'Жеңіл рельсті көлік желісі', M4: 'Саябақ немесе гүлзар',
    M5: 'Жеке секторды таза отынға көшіру', M6: 'Қалалық көгалдандыру бағдарламасы',
    M7: 'Мектеп пен балабақша', M8: 'Отбасылық денсаулық орталығы',
    M9: 'Аула спорт орталықтары', M10: 'Жарықтандыру мен камералар',
    M11: 'Қауіпсіз өткелдер мен мектеп аймақтары', M12: 'Өтініштердің бірыңғай цифрлық платформасы',
    M13: 'Жылу және су желілерін жаңғырту', M14: 'Апаттық коммуналдық бригадалар',
  };
  const copy = {
    ru: {
      eyebrow: 'Схема модели', title: 'Карта пяти районов',
      intro: 'Условное расположение районов модели, не географическая карта. Выберите район, чтобы изучить решения и показатели.',
      reset: 'Весь город', languages: 'Язык карты', select: 'выбрать район',
      districts: 'Районы карты', caption: 'Цвет показывает состояние самого низкого показателя района; текст и числа доступны справа.',
      legend: 'Обозначения', critical: 'Критическое', weak: 'Слабое', stable: 'Стабильное',
      population: 'Доля населения', draft: 'Черновик сценария', accepted: 'Принятый сценарий',
      decisions: 'Решения', cost: 'Расход', remaining: 'Остаток бюджета',
      validation: 'Состояние черновика', ready: 'Можно принять пять решений',
      incomplete: 'Для принятия нужны пять допустимых решений',
      districtDecisions: 'Решения для района', cityDecisions: 'Городские решения — все районы',
      allDistrictDecisions: 'Районные решения и цели', none: 'Нет',
      initial: 'Исходные показатели', final: 'Показатели на конец Q8',
      districtScore: 'Оценка района', cityScore: 'Astana Quality of Life Score',
      cityAverage: 'Средневзвешенный результат', status: 'Статус',
    },
    kk: {
      eyebrow: 'Модель сызбасы', title: 'Бес аудан картасы',
      intro: 'Модель аудандарының шартты орналасуы, географиялық карта емес. Шешімдер мен көрсеткіштерді көру үшін ауданды таңдаңыз.',
      reset: 'Бүкіл қала', languages: 'Карта тілі', select: 'ауданды таңдау',
      districts: 'Карта аудандары', caption: 'Түс ауданның ең төмен көрсеткішінің күйін көрсетеді; мәтін мен сандар оң жақта берілген.',
      legend: 'Белгілер', critical: 'Күрделі', weak: 'Әлсіз', stable: 'Тұрақты',
      population: 'Халық үлесі', draft: 'Сценарий жобасы', accepted: 'Қабылданған сценарий',
      decisions: 'Шешімдер', cost: 'Шығын', remaining: 'Бюджет қалдығы',
      validation: 'Жобаның күйі', ready: 'Бес шешімді қабылдауға болады',
      incomplete: 'Қабылдау үшін бес жарамды шешім қажет',
      districtDecisions: 'Ауданға арналған шешімдер', cityDecisions: 'Қалалық шешімдер — барлық аудандар',
      allDistrictDecisions: 'Аудандық шешімдер мен мақсаттар', none: 'Жоқ',
      initial: 'Бастапқы көрсеткіштер', final: 'Q8 соңындағы көрсеткіштер',
      districtScore: 'Аудан бағасы', cityScore: 'Astana Quality of Life Score',
      cityAverage: 'Салмақталған орташа нәтиже', status: 'Күйі',
    },
  };

  const safe = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const districtOf = (id) => catalog.districts.find((item) => item.id === id);
  const measureOf = (id) => catalog.measures.find((item) => item.id === id);
  const districtName = (district) => locale === 'kk' ? kkDistricts[district.id][0] : district.name;
  const districtProfile = (district) => locale === 'kk' ? kkDistricts[district.id][1] : district.profile;
  const measureName = (measure) => locale === 'kk' ? kkMeasures[measure.id] : measure.name;
  const indicatorName = (indicator) => locale === 'kk' ? kkIndicators[indicator.id] : indicator.name;
  const statusOf = (value) => value < 40 ? 'critical' : value < 55 ? 'weak' : 'stable';
  const number = (value) => Number(value).toFixed(2);

  function decisionList(items, includeTarget = false) {
    if (!items.length) return `<p>${copy[locale].none}</p>`;
    return `<ul>${items.map((decision) => {
      const measure = measureOf(decision.measureId);
      const target = includeTarget ? ` — ${districtName(districtOf(decision.districtId))}` : '';
      return `<li>${safe(measure.id)} · ${safe(measureName(measure))}${safe(target)} · ${safe(measure.cost)}</li>`;
    }).join('')}</ul>`;
  }

  function indicatorTable(district, values) {
    const text = copy[locale];
    return `<div class="map-indicators"><h4>${result ? text.final : text.initial}</h4><dl>${catalog.indicators.map((indicator) => {
      const value = values[indicator.id];
      const status = statusOf(value);
      return `<div data-map-indicator="${indicator.id}"><dt>${indicator.id} · ${safe(indicatorName(indicator))}</dt><dd>${result ? number(value) : value} <span class="map-status map-status-${status}">${text[status]}</span></dd></div>`;
    }).join('')}</dl></div>`;
  }

  function renderDetail() {
    const text = copy[locale];
    const cost = result ? result.cost : validation.cost;
    const summary = `<p class="map-summary">${result ? text.accepted : text.draft} · ${text.decisions}: ${decisions.length}/5 · ${text.cost}: ${cost} · ${text.remaining}: ${catalog.budget - cost}</p>`;
    const state = result
      ? ''
      : `<p>${text.validation}: ${validation.errors.length === 0 && decisions.length === 5 ? text.ready : text.incomplete}</p>`;
    const cityDecisions = `<section class="map-decision-group"><h4>${text.cityDecisions}</h4>${decisionList(decisions.filter((decision) => !decision.districtId))}</section>`;
    if (!selected) {
      detail.innerHTML = `<h3>${text.reset}</h3>${summary}${state}${result ? `<p>${text.cityScore}: ${result.score.toFixed(5)} · ${text.cityAverage}: ${result.weightedAverage.toFixed(3)}</p>` : ''}${cityDecisions}<section class="map-decision-group"><h4>${text.allDistrictDecisions}</h4>${decisionList(decisions.filter((decision) => decision.districtId), true)}</section>`;
      return;
    }
    const district = districtOf(selected);
    const calculated = result?.districts.find((item) => item.id === selected);
    detail.innerHTML = `<h3>${safe(districtName(district))}</h3><p>${safe(districtProfile(district))}</p><p>${text.population}: ${Math.round(district.populationShare * 100)}%</p>${summary}${state}${calculated ? `<p>${text.districtScore}: ${calculated.score.toFixed(3)}</p>` : ''}${indicatorTable(district, calculated?.indicators ?? district.indicators)}<section class="map-decision-group"><h4>${text.districtDecisions}</h4>${decisionList(decisions.filter((decision) => decision.districtId === selected))}</section>${cityDecisions}`;
  }

  function render() {
    const text = copy[locale];
    document.querySelector('.map-section').lang = locale;
    document.querySelector('#map-eyebrow').textContent = text.eyebrow;
    document.querySelector('#map-title').textContent = text.title;
    document.querySelector('#map-intro').textContent = text.intro;
    document.querySelector('#map-caption').textContent = text.caption;
    document.querySelector('#map-list').setAttribute('aria-label', text.districts);
    document.querySelector('#map-legend').setAttribute('aria-label', text.legend);
    document.querySelector('#map-legend').innerHTML = `<span>${text.critical}: &lt; 40</span><span>${text.weak}: 40–54</span><span>${text.stable}: 55+</span>`;
    document.querySelector('.map-languages').setAttribute('aria-label', text.languages);
    reset.textContent = text.reset;
    reset.setAttribute('aria-pressed', String(selected === null));
    map.setAttribute('aria-label', text.title);
    document.querySelectorAll('[data-map-locale]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mapLocale === locale)));
    document.querySelectorAll('[data-map-district]').forEach((control) => {
      const district = districtOf(control.dataset.mapDistrict);
      const values = result?.districts.find((item) => item.id === district.id)?.indicators ?? district.indicators;
      const lowest = Math.min(...Object.values(values));
      control.dataset.status = statusOf(lowest);
      control.dataset.selected = String(selected === district.id);
      control.setAttribute('aria-pressed', String(selected === district.id));
      control.setAttribute('aria-label', `${districtName(district)} — ${text.select}`);
      control.querySelector('text').textContent = districtName(district);
    });
    document.querySelectorAll('[data-map-list-district]').forEach((button) => {
      const district = districtOf(button.dataset.mapListDistrict);
      button.textContent = districtName(district);
      button.setAttribute('aria-pressed', String(selected === district.id));
    });
    renderDetail();
  }

  function select(id) { selected = selected === id ? null : id; render(); }
  map.addEventListener('click', (event) => {
    const control = event.target.closest('[data-map-district]');
    if (control) select(control.dataset.mapDistrict);
  });
  map.addEventListener('keydown', (event) => {
    const control = event.target.closest('[data-map-district]');
    if (control && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      select(control.dataset.mapDistrict);
    }
  });
  document.querySelector('#map-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-map-list-district]');
    if (button) select(button.dataset.mapListDistrict);
  });
  reset.addEventListener('click', () => { selected = null; render(); });
  document.querySelector('.map-languages').addEventListener('click', (event) => {
    const button = event.target.closest('[data-map-locale]');
    if (button) { locale = button.dataset.mapLocale; render(); }
  });

  window.QalaMap = {
    update(next) {
      decisions = next.decisions;
      validation = next.validation;
      result = next.result ?? null;
      render();
    },
  };
  render();
})();

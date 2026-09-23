const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { catalogPayload, localizedDistrictName, normalizeLocale } = require('./src/data');
const { renderPage } = require('./src/view');
const { calculateScenario } = require('./src/simulation');
const { analyzeScenario } = require('./src/ai-analysis');
const { createOpenAiAnalysisProvider } = require('./src/openai-analysis-provider');

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('invalid_json')); }
    });
    request.on('error', reject);
  });
}

function requestLocale(request) {
  return normalizeLocale(new URL(request.url, 'http://qala.local').searchParams.get('locale'));
}

const validationMessages = {
  ru: {
    decisions_required: 'Решения должны быть массивом.', exactly_five_decisions_required: 'Нужно выбрать ровно пять решений.',
    unknown_measure: 'Мероприятия нет в каталоге.', duplicate_measure: 'Мероприятие можно выбрать только один раз.',
    district_required: 'Для районного мероприятия нужен существующий район.', city_measure_has_no_district: 'Для городского мероприятия район не указывается.',
    budget_exceeded: 'Стоимость сценария превышает бюджет.', direction_limit_exceeded: 'В одном направлении нельзя выбрать более двух мероприятий.',
    incompatible_measures: 'Эти мероприятия несовместимы.',
  },
  kk: {
    decisions_required: 'Шешімдер массив болуы керек.', exactly_five_decisions_required: 'Дәл бес шешімді таңдау қажет.',
    unknown_measure: 'Іс-шара каталогта жоқ.', duplicate_measure: 'Іс-шараны тек бір рет таңдауға болады.',
    district_required: 'Аудандық іс-шара үшін бар аудан қажет.', city_measure_has_no_district: 'Қалалық іс-шараға аудан көрсетілмейді.',
    budget_exceeded: 'Сценарий құны бюджеттен асады.', direction_limit_exceeded: 'Бір бағытта екіден көп іс-шара таңдауға болмайды.',
    incompatible_measures: 'Бұл іс-шаралар үйлеспейді.',
  },
};

function localizeCalculation(calculation, locale) {
  if (!calculation.accepted) return {
    ...calculation,
    errors: calculation.errors.map((item) => ({ ...item, message: validationMessages[locale][item.code] ?? item.message })),
  };
  if (locale === 'ru') return calculation;
  const localizeDistrict = (district) => ({ ...district, name: localizedDistrictName(district.id, locale) });
  const localizeResult = (result) => ({
    ...result,
    districts: result.districts.map(localizeDistrict),
    weakestDistrict: { ...result.weakestDistrict, name: localizedDistrictName(result.weakestDistrict.id, locale) },
    criticalIndicators: result.criticalIndicators.map((item) => ({ ...item, districtName: localizedDistrictName(item.districtId, locale) })),
  });
  const result = localizeResult(calculation.result);
  return {
    ...calculation,
    result: {
      ...result,
      recommendation: {
        ...result.recommendation,
        impacts: result.recommendation.impacts.map((impact) => ({ ...impact, name: localizedDistrictName(impact.id, locale) })),
        result: result.recommendation.result && {
          ...result.recommendation.result,
          ...localizeResult(result.recommendation.result),
        },
      },
    },
  };
}

function createServer({ analysisProvider = createOpenAiAnalysisProvider() } = {}) {
  return http.createServer(async (request, response) => {
    if (request.method === 'POST' && request.url === '/api/scenarios/accept') {
      try {
        const body = await readJson(request);
        const calculation = calculateScenario(body.decisions);
        const localized = localizeCalculation(calculation, normalizeLocale(body.locale));
        return sendJson(response, localized.accepted ? 200 : 400, localized);
      } catch {
        return sendJson(response, 400, { accepted: false, errors: [{ code: 'invalid_json', message: 'Request body must be valid JSON' }] });
      }
    }
    if (request.method === 'POST' && request.url === '/api/scenarios/analyze') {
      try {
        const body = await readJson(request);
        const calculation = calculateScenario(body.decisions);
        if (!calculation.accepted) return sendJson(response, 400, calculation);
        return sendJson(response, 200, { accepted: true, ...await analyzeScenario(calculation, analysisProvider) });
      } catch {
        return sendJson(response, 400, { accepted: false, errors: [{ code: 'invalid_json', message: 'Request body must be valid JSON' }] });
      }
    }
    if (request.method === 'GET' && request.url === '/client.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return response.end(fs.readFileSync(path.join(__dirname, 'public', 'client.js')));
    }
    if (request.method === 'GET' && request.url === '/history.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return response.end(fs.readFileSync(path.join(__dirname, 'public', 'history.js')));
    }
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
    if (new URL(request.url, 'http://qala.local').pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(renderPage(catalogPayload(requestLocale(request))));
    }
    if (request.url.startsWith('/api/catalog')) return sendJson(response, 200, catalogPayload(requestLocale(request)));
    return sendJson(response, 404, { error: 'Not found' });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => console.log(`QALA запущена: http://localhost:${port}`));
}

module.exports = { createServer };

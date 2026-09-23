const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { catalogPayload, localizedDistrictName, normalizeLocale } = require('./src/data');
const { renderPage } = require('./src/view');
const { calculateScenario, CATALOG_VERSION, MODEL_VERSION, compareWithGlobalOptimum } = require('./src/simulation');
const { analyzeScenario } = require('./src/ai-analysis');
const { createOpenAiAnalysisProvider } = require('./src/openai-analysis-provider');
const { createAiAnalysisService } = require('./src/ai-analysis');

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

const kazakhBasicAnalysis = {
  label: 'Базалық талдау',
  sections: { summary: 'Қорытынды', strengths: 'Күшті жақтар', problems: 'Қалған мәселелер мен ымыралар', replacement: 'Нүктелік ауыстыру' },
  conclusions: {
    'scenario-result': 'Қорытынды баға мен бастапқы жағдайға қатысты өзгеріс қабылданған сценарий үшін жергілікті есептелді.',
    'largest-improvement': 'Көрсеткіштің ең үлкен есептік жақсаруы осы шешімдер жиынының Q8 көкжиегіндегі күшті жағын көрсетеді.',
    'weakest-district': 'Есептелген нәтижедегі ең әлсіз аудан назар аударатын нүкте болып қалады.',
    'remaining-weak-indicators': 'Модельде әлсіз көрсеткіштер қалды. Бұл Q8-дегі есептік мәндер, қалалық оқиғалардың болжамы емес.',
    'critical-indicators': 'Сындарлы көрсеткіштер тек 40-тан төмен есептік шекпен анықталады.',
    'replacement-tradeoffs': 'Рұқсат етілген ауыстыру кейбір көрсеткіштерді өзгелерінің пайдасына өзгертеді; төмендегі шығындар осы балама үшін есептелген.',
    'targeted-replacement': 'Рұқсат етілген нүктелік ауыстыру есептелді: сценарийдің қалған төрт шешімі өзгермейді.',
    'no-targeted-replacement': 'Score-дың қатаң оң өсімі бар нүктелік ауыстыру табылмады; бұл жаһандық максимумды дәлелдемейді.',
  },
};

function localizeBasicAnalysis(analysis, locale) {
  if (locale !== 'kk') return { ...analysis, locale: 'ru' };
  return {
    ...analysis,
    locale: 'kk',
    label: kazakhBasicAnalysis.label,
    sections: analysis.sections.map((section) => ({
      ...section,
      title: kazakhBasicAnalysis.sections[section.id] || section.title,
      conclusions: section.conclusions.map((conclusion) => ({
        ...conclusion,
        text: kazakhBasicAnalysis.conclusions[conclusion.id] || conclusion.text,
      })),
    })),
  };
}

function localizeCalculation(calculation, locale) {
  if (!calculation.accepted) return {
    ...calculation,
    errors: calculation.errors.map((item) => ({ ...item, message: validationMessages[locale][item.code] ?? item.message })),
  };
  if (locale === 'ru') {
    return { ...calculation, result: { ...calculation.result, basicAnalysis: localizeBasicAnalysis(calculation.result.basicAnalysis, locale) } };
  }
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
      basicAnalysis: localizeBasicAnalysis(result.basicAnalysis, locale),
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

function createServer({ analysisProvider = createOpenAiAnalysisProvider(), aiProvider, aiService } = {}) {
  const cachedProvider = aiProvider || (analysisProvider?.analyze ? async ({ locale, result }) => {
    const outcome = await analyzeScenario({ result }, analysisProvider);
    if (outcome.source !== 'ai') throw new Error('AI analysis is unavailable');
    return {
      ...outcome.analysis,
      kind: 'ai',
      locale,
      sections: outcome.analysis.sections.map((section) => ({ ...section, conclusions: section.conclusions.map((conclusion, index) => ({ ...conclusion, id: `${section.id}-${index}` })) })),
    };
  } : null);
  const cachedAiService = aiService || createAiAnalysisService({ provider: cachedProvider });
  const attempts = new Map();
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://qala.local');
    if (request.method === 'POST' && url.pathname === '/api/scenarios/accept') {
      try {
        const body = await readJson(request);
        const calculation = calculateScenario(body.decisions);
        const locale = normalizeLocale(body.locale);
        if (!calculation.accepted) {
          const localized = localizeCalculation(calculation, locale);
          return sendJson(response, 400, localized);
        }
        const attemptId = body.attemptId || crypto.randomUUID();
        const savedDecisions = JSON.stringify(calculation.decisions);
        const previous = attempts.get(attemptId);
        if (previous && previous.decisions !== savedDecisions) {
          return sendJson(response, 409, { accepted: false, errors: [{ code: 'attempt_context_conflict', message: 'Attempt ID is already bound to another scenario' }] });
        }
        attempts.set(attemptId, { decisions: savedDecisions, calculation });
        const localized = localizeCalculation(calculation, locale);
        return sendJson(response, 200, {
          ...localized,
          attemptId,
          analysis: { status: 'loading', locale, analysis: localized.result.basicAnalysis },
        });
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
    const whatIfMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/what-if$/);
    if (request.method === 'POST' && whatIfMatch) {
      try {
        const body = await readJson(request);
        const attemptId = decodeURIComponent(whatIfMatch[1]);
        const context = attempts.get(attemptId);
        if (!context) return sendJson(response, 404, { error: 'Attempt not found' });
        if ((body.catalogVersion && body.catalogVersion !== CATALOG_VERSION)
          || (body.modelVersion && body.modelVersion !== MODEL_VERSION)) {
          return sendJson(response, 409, {
            error: 'comparison_version_mismatch',
            catalogVersion: CATALOG_VERSION,
            modelVersion: MODEL_VERSION,
          });
        }
        const locale = normalizeLocale(body.locale);
        const comparison = compareWithGlobalOptimum(context.calculation);
        return sendJson(response, 200, {
          attemptId,
          locale,
          comparison: {
            ...comparison,
            notice: locale === 'kk'
              ? 'Бұл синтетикалық каталог пен формуланың максимумы; ол нақты қала саясатының ұсынымы емес.'
              : 'Это максимум синтетического каталога и формулы, а не рекомендация реальной городской политики.',
          },
        });
      } catch {
        return sendJson(response, 400, { error: 'invalid_json' });
      }
    }
    const analysisMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/analysis$/);
    if (request.method === 'POST' && analysisMatch) {
      try {
        const body = await readJson(request);
        const attemptId = decodeURIComponent(analysisMatch[1]);
        const context = attempts.get(attemptId);
        if (!context) return sendJson(response, 404, { error: 'Attempt not found' });
        const locale = normalizeLocale(body.locale);
        const outcome = await cachedAiService.request({
          attemptId,
          locale,
          facts: context.calculation.result.facts,
          result: context.calculation.result,
          basicAnalysis: localizeBasicAnalysis(context.calculation.result.basicAnalysis, locale),
        });
        return sendJson(response, 200, { attemptId, locale, ...outcome });
      } catch {
        return sendJson(response, 400, { error: 'invalid_json' });
      }
    }
    if (request.method === 'GET' && url.pathname === '/client.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return response.end(fs.readFileSync(path.join(__dirname, 'public', 'client.js')));
    }
    if (request.method === 'GET' && url.pathname === '/history.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return response.end(fs.readFileSync(path.join(__dirname, 'public', 'history.js')));
    }
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
    if (url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return response.end(renderPage(catalogPayload(requestLocale(request))));
    }
    if (url.pathname === '/api/catalog') return sendJson(response, 200, catalogPayload(requestLocale(request)));
    return sendJson(response, 404, { error: 'Not found' });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, () => console.log(`QALA запущена: http://localhost:${port}`));
}

module.exports = { createServer };

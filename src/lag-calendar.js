const { catalogPayload, normalizeLocale } = require('./data');

const CALENDAR_LABELS = {
  ru: {
    cityScope: 'Весь город',
    districtScope: 'Один район',
    waiting: 'До начала действия',
    active: 'Период действия',
    onset: 'Начало действия',
    q8: 'Результат на конец Q8',
    horizon: 'Горизонт Q1–Q8',
  },
  kk: {
    cityScope: 'Бүкіл қала',
    districtScope: 'Бір аудан',
    waiting: 'Әсері басталғанға дейін',
    active: 'Әсер ету кезеңі',
    onset: 'Әсердің басталуы',
    q8: 'Q8 соңындағы нәтиже',
    horizon: 'Q1–Q8 көкжиегі',
  },
};

function buildLagCalendar(decisions, locale = 'ru') {
  if (!Array.isArray(decisions)) throw new TypeError('Accepted decisions must be an array');
  const selectedLocale = normalizeLocale(locale);
  const labels = CALENDAR_LABELS[selectedLocale];
  const catalog = catalogPayload(selectedLocale);
  const measuresById = new Map(catalog.measures.map((measure) => [measure.id, measure]));
  const districtsById = new Map(catalog.districts.map((district) => [district.id, district]));
  const horizonQuarters = catalog.horizonQuarters;

  return decisions.map((decision, index) => {
    const measure = measuresById.get(decision?.measureId);
    if (!measure) throw new Error(`Unknown measure in accepted scenario: ${decision?.measureId}`);
    const isCityWide = measure.scope === 'city';
    const target = isCityWide ? null : districtsById.get(decision.districtId);
    if (!isCityWide && !target) throw new Error(`Unknown district in accepted scenario: ${decision?.districtId}`);
    const onsetQuarter = measure.delay + 1;
    const quarters = Array.from({ length: horizonQuarters }, (_, quarterIndex) => {
      const quarter = quarterIndex + 1;
      const isOnset = quarter === onsetQuarter;
      const isQ8 = quarter === horizonQuarters;
      return {
        quarter,
        marker: isQ8 ? 'q8-result' : isOnset ? 'onset' : quarter < onsetQuarter ? 'waiting' : 'active',
        label: isQ8 ? labels.q8 : isOnset ? labels.onset : quarter < onsetQuarter ? labels.waiting : labels.active,
      };
    });
    return {
      decisionIndex: index,
      measureId: measure.id,
      event: measure.name,
      targetId: target?.id || null,
      targetLabel: target?.name || labels.cityScope,
      direction: measure.direction,
      cost: measure.cost,
      lag: measure.delay,
      scope: measure.scope,
      scopeLabel: isCityWide ? labels.cityScope : labels.districtScope,
      onsetQuarter,
      horizonQuarters,
      horizonLabel: labels.horizon,
      q8Label: labels.q8,
      quarters,
    };
  });
}

module.exports = { CALENDAR_LABELS, buildLagCalendar };

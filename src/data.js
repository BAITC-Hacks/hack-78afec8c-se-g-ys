const indicators = [
  { id: 'T1', direction: 'Транспорт', name: 'Разгрузка дорог', description: '100 = нет пробок в час пик, 0 = стоит всё' },
  { id: 'T2', direction: 'Транспорт', name: 'Доступность общественного транспорта', description: '100 = все жители в 500 м от остановки с интервалом ≤10 мин' },
  { id: 'E1', direction: 'Экология', name: 'Озеленение', description: '100 = ≥20 м² зелени на жителя' },
  { id: 'E2', direction: 'Экология', name: 'Качество воздуха', description: '100 = зимой AQI ≤50, 0 = хронический смог' },
  { id: 'S1', direction: 'Соцсфера', name: 'Школы и детсады', description: '100 = 100% нормативной потребности, без 2-й смены' },
  { id: 'S2', direction: 'Соцсфера', name: 'Поликлиники и первичная медпомощь', description: '100 = норматив на жителя выполнен полностью' },
  { id: 'B1', direction: 'Безопасность', name: 'Безопасность улиц', description: '100 = освещение и камеры везде, минимум происшествий' },
  { id: 'B2', direction: 'Безопасность', name: 'Безопасность дорожного движения', description: '100 = минимум ДТП с пострадавшими' },
  { id: 'C1', direction: 'Сервисы', name: 'Надёжность ЖКХ', description: '100 = нет аварий отопления/воды за год' },
  { id: 'C2', direction: 'Сервисы', name: 'Скорость решения обращений жителей', description: '100 = все обращения закрыты в срок' },
];

const districts = [
  { id: 'esil', name: 'Есиль', populationShare: 0.27, profile: 'Богатый район, но с пробками на мостах и переполненными школами.', indicators: { T1: 45, T2: 62, E1: 68, E2: 72, S1: 48, S2: 55, B1: 78, B2: 60, C1: 75, C2: 70 } },
  { id: 'almaty', name: 'Алматы', populationShare: 0.24, profile: 'Старый ЖКХ и пробки.', indicators: { T1: 40, T2: 75, E1: 50, E2: 55, S1: 60, S2: 65, B1: 62, B2: 52, C1: 50, C2: 60 } },
  { id: 'saryarka', name: 'Сарыарка', populationShare: 0.20, profile: 'Смог от частного сектора и слабое озеленение.', indicators: { T1: 50, T2: 70, E1: 42, E2: 40, S1: 62, S2: 68, B1: 58, B2: 55, C1: 45, C2: 55 } },
  { id: 'baikonur', name: 'Байконур', populationShare: 0.13, profile: 'Середняк без ярких перекосов.', indicators: { T1: 52, T2: 68, E1: 55, E2: 50, S1: 58, S2: 60, B1: 52, B2: 58, C1: 55, C2: 58 } },
  { id: 'nura', name: 'Нура', populationShare: 0.16, profile: 'Главный аутсайдер по соцсфере и транспорту.', indicators: { T1: 55, T2: 40, E1: 45, E2: 65, S1: 38, S2: 35, B1: 55, B2: 50, C1: 60, C2: 50 } },
];

const measures = [
  { id: 'M1', direction: 'Транспорт', name: 'Выделенные полосы для автобусов', scope: 'district', cost: 18, delay: 2, effects: { T1: 6, T2: 9 } },
  { id: 'M2', direction: 'Транспорт', name: 'Умные светофоры (адаптивное управление)', scope: 'city', cost: 22, delay: 2, effects: { T1: 4, B2: 3 } },
  { id: 'M3', direction: 'Транспорт', name: 'Линия ЛРТ / расширение', scope: 'district', cost: 30, delay: 4, effects: { T1: 16, T2: 20, E2: 4 } },
  { id: 'M4', direction: 'Экология', name: 'Парк / сквер', scope: 'district', cost: 15, delay: 2, effects: { E1: 12, E2: 3, B1: 2 } },
  { id: 'M5', direction: 'Экология', name: 'Перевод частного сектора на чистое топливо', scope: 'district', cost: 25, delay: 3, effects: { E2: 14, C1: 4 } },
  { id: 'M6', direction: 'Экология', name: 'Городская программа озеленения и ветрозащитных полос', scope: 'city', cost: 20, delay: 4, effects: { E1: 5, E2: 3 } },
  { id: 'M7', direction: 'Соцсфера', name: 'Школа + детсад (модульное строительство)', scope: 'district', cost: 24, delay: 3, effects: { S1: 16 } },
  { id: 'M8', direction: 'Соцсфера', name: 'Центр семейного здоровья / поликлиника', scope: 'district', cost: 20, delay: 3, effects: { S2: 14 } },
  { id: 'M9', direction: 'Соцсфера', name: 'Дворовые спорт-хабы', scope: 'district', cost: 10, delay: 1, effects: { S1: 3, S2: 3, B1: 3 } },
  { id: 'M10', direction: 'Безопасность', name: 'Освещение и камеры (расширение Safe City)', scope: 'district', cost: 12, delay: 1, effects: { B1: 12, B2: 2 } },
  { id: 'M11', direction: 'Безопасность', name: 'Безопасные переходы и школьные зоны', scope: 'district', cost: 10, delay: 1, effects: { B2: 12, T1: -2 } },
  { id: 'M12', direction: 'Сервисы', name: 'Единая цифровая платформа обращений', scope: 'city', cost: 14, delay: 1, effects: { C2: 5 } },
  { id: 'M13', direction: 'Сервисы', name: 'Модернизация тепло- и водосетей', scope: 'district', cost: 28, delay: 4, effects: { C1: 18, E2: 2 } },
  { id: 'M14', direction: 'Сервисы', name: 'Аварийные бригады ЖКХ + раннее оповещение', scope: 'city', cost: 16, delay: 1, effects: { C1: 5, C2: 2 } },
];

function indicatorStatus(value) {
  if (value < 40) return 'critical';
  if (value < 55) return 'weak';
  return 'stable';
}

function catalogPayload() {
  return {
    locale: 'ru',
    budget: 100,
    horizonQuarters: 8,
    indicators,
    districts: districts.map((district) => ({
      ...district,
      indicatorStatus: Object.fromEntries(Object.entries(district.indicators).map(([id, value]) => [id, indicatorStatus(value)])),
    })),
    measures,
  };
}

module.exports = { indicators, districts, measures, catalogPayload, indicatorStatus };

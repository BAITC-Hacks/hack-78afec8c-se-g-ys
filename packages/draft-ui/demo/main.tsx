import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createDraftValidator, DraftEditor, type DraftCatalog, type Locale } from "../src";
import "../src/style.css";
import "./style.css";

const validate = createDraftValidator();

type Text = Record<Locale, string>;
type Indicator = { id: string; name: Text; description: Text };
type District = { id: string; name: Text; profile: Text; populationShare: number; indicators: Record<string, number> };
type Measure = DraftCatalog["measures"][number] & { delay: number; effects: Record<string, number> };
type QalaCatalog = Omit<DraftCatalog, "districts" | "measures"> & {
  horizonQuarters: number;
  indicators: Indicator[];
  districts: District[];
  measures: Measure[];
};

const directionNames: Record<string, Text> = {
  transport: { ru: "Транспорт", kk: "Көлік" }, ecology: { ru: "Экология", kk: "Экология" },
  social: { ru: "Соцсфера", kk: "Әлеуметтік сала" }, safety: { ru: "Безопасность", kk: "Қауіпсіздік" },
  services: { ru: "Сервисы", kk: "Қызметтер" },
};

function status(value: number) { return value < 40 ? "critical" : value < 55 ? "weak" : "stable"; }

function CityState({ catalog, locale }: { catalog: QalaCatalog; locale: Locale }) {
  const labels = locale === "ru"
    ? { city: "Исходное состояние города", districts: "Районы", indicators: "Показатели", catalog: "Каталог мероприятий", district: "Один район", citywide: "Весь город", cost: "Стоимость", delay: "Лаг", effects: "Эффекты", population: "населения" }
    : { city: "Қаланың бастапқы жағдайы", districts: "Аудандар", indicators: "Көрсеткіштер", catalog: "Іс-шаралар каталогы", district: "Бір аудан", citywide: "Бүкіл қала", cost: "Құны", delay: "Кідіріс", effects: "Әсерлер", population: "халық" };
  return <>
    <section className="overview" aria-labelledby="city-title">
      <div><p className="eyebrow">QALA · {locale === "ru" ? "исходные данные" : "бастапқы деректер"}</p><h1 id="city-title">{labels.city}</h1><p>{locale === "ru" ? "Общие данные для всех участников. Шкала показателей: 0–100." : "Барлық қатысушыларға ортақ деректер. Көрсеткіштер шкаласы: 0–100."}</p></div>
      <strong>{locale === "ru" ? "Бюджет" : "Бюджет"}: {catalog.budget} · {catalog.horizonQuarters} {locale === "ru" ? "кварталов" : "тоқсан"}</strong>
    </section>
    <section aria-labelledby="district-title"><h2 id="district-title">{labels.districts}</h2><div className="district-grid">
      {catalog.districts.map(district => <article className="district-card" key={district.id}><div><h3>{district.name[locale]}</h3><span>{Math.round(district.populationShare * 100)}% {labels.population}</span></div><p>{district.profile[locale]}</p><dl>{catalog.indicators.map(indicator => <div key={indicator.id} title={indicator.description[locale]}><dt>{indicator.id}</dt><dd className={status(district.indicators[indicator.id])}>{district.indicators[indicator.id]}</dd></div>)}</dl></article>)}
    </div></section>
    <section className="indicator-list" aria-labelledby="indicator-title"><h2 id="indicator-title">{labels.indicators}</h2><ul>{catalog.indicators.map(indicator => <li key={indicator.id}><strong>{indicator.id} · {indicator.name[locale]}</strong><span>{indicator.description[locale]}</span></li>)}</ul></section>
    <section aria-labelledby="catalog-title"><h2 id="catalog-title">{labels.catalog}</h2><div className="measure-grid">
      {catalog.measures.map(measure => <article className="measure-card" key={measure.id}><div><b>{measure.id}</b><span>{measure.scope === "city" ? labels.citywide : labels.district}</span></div><h3>{measure.name[locale]}</h3><p>{directionNames[measure.direction][locale]}</p><dl><div><dt>{labels.cost}</dt><dd>{measure.cost}</dd></div><div><dt>{labels.delay}</dt><dd>{measure.delay}</dd></div></dl><p className="effects">{labels.effects}: {Object.entries(measure.effects).map(([id, value]) => `${id} ${value > 0 ? "+" : ""}${value}`).join(" · ")}</p></article>)}
    </div></section>
  </>;
}

function App() {
  const [catalog, setCatalog] = useState<QalaCatalog | null>(null);
  const [locale, setLocale] = useState<Locale>("ru");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog", { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Catalogue unavailable");
        return response.json() as Promise<QalaCatalog>;
      })
      .then(setCatalog)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  return <main>
    <header><strong className="brand">QALA<span> / </span></strong>
      <nav aria-label="Language">
        <button type="button" aria-pressed={locale === "ru"} onClick={() => setLocale("ru")}>Русский</button>
        <button type="button" aria-pressed={locale === "kk"} onClick={() => setLocale("kk")}>Қазақша</button>
      </nav>
    </header>
    {catalog ? <><CityState catalog={catalog} locale={locale} /><section className="draft-section"><DraftEditor catalog={catalog} locale={locale} validate={validate} /></section></>
      : <p role={failed ? "alert" : "status"}>{locale === "ru"
        ? failed ? "Каталог недоступен. Обновите страницу, чтобы повторить." : "Загружаем каталог…"
        : failed ? "Каталог қолжетімсіз. Қайталау үшін бетті жаңартыңыз." : "Каталог жүктелуде…"}</p>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

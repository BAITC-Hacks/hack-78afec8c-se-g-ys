# PRD: QALA — третья фаза: академическая прозрачность и демонстрационный рассказ

## Problem Statement

После принятия сценария участник видит итоговый Astana Quality of Life Score, изменения показателей, разбор сценария, точечную замену и, во второй фазе, глобальное сравнение. Но итоговый эффект пяти взаимозависимых управленческих решений всё ещё трудно объяснить: простое вычитание эффекта одного мероприятия неверно при лагах, клиппинге, критическом пороге, минимуме района и синергиях. Участнику и жюри нужен честный способ исследовать вклад каждого уже выбранного решения, не выдавая частичные наборы за допустимые сценарии.

Участнику также нужен более связный образовательный рассказ о собственной попытке и краткий, воспроизводимый материал для защиты. Свободный совет без расчётных оснований или автоматически придуманная презентация подорвут принцип QALA «код считает, AI объясняет». Фаза 3 должна улучшить академическую ясность и демонстрационную подачу, не заменяя самостоятельный выбор участника, детерминированные расчёты или готовность первых двух фаз.

## Solution

Третья фаза добавляет три опциональные возможности поверх завершённых первых двух фаз:

- Impact Breakdown с Shapley Values для пяти управленческих решений принятого сценария;
- персонажа City Advisor, который помогает участнику прочитать уже рассчитанный результат и переходить между его проверяемыми фактами;
- краткую презентацию принятой попытки, собранную из тех же проверенных данных для локальной демонстрации.

Shapley Values рассчитываются для ровно пяти решений принятого допустимого сценария по всем 32 подмножествам. Внутренняя контрфактическая функция полезности применяет эффекты подмножества к исходному состоянию и вычисляет ту же числовую формулу результата. Её значения существуют только для маржинальных вкладов: неполное подмножество не становится допустимым сценарием, не получает отображаемый Astana Quality of Life Score и не попадает в историю попыток. Сумма пяти вкладов равна разнице между результатом полного сценария и базовым состоянием.

City Advisor не принимает решения и не является открытым чат-ботом. Это локализованный интерфейсный персонаж, который раскрывает заранее определённые вопросы о текущей попытке, направляет к расчётным фактам, Impact Breakdown, оставшимся проблемам, точечной замене и глобальному сравнению, если оно было явно открыто участником. Любой динамический AI-текст использует тот же проверяемый набор фактов и базовый разбор при сбое, что и первая фаза.

Презентация — это компактная трёхчастная история одной принятой попытки: контекст и выбранные пять решений, измеренный результат и компромиссы, затем возможности улучшения и методологические ограничения. Она использует только сохранённые расчётные факты и уже доступные в попытке материалы; итог можно открыть в интерфейсе и вывести в PDF средствами браузера. Она не создаёт новую попытку и не раскрывает глобальный максимум, если участник ещё не сделал этого явно.

## User Stories

1. As a participant, I want to see the contribution of each of my five management decisions, so that I can understand how the result emerged from their interaction.
2. As a participant, I want the contribution view to identify the exact event and territorial target of each decision, so that I do not confuse a measure with its placement.
3. As a participant, I want the five contributions to reconcile to the change from the baseline result to my accepted scenario, so that the breakdown is mathematically accountable.
4. As a participant, I want to see positive, negative, and zero contributions without artificial optimism, so that I can recognise trade-offs.
5. As a participant, I want contributions to account for synergies, lag, clipping, the weakest-district term, and critical indicators, so that nonlinear interactions are not hidden.
6. As a participant, I want a plain-language explanation of what a Shapley Value means, so that I do not mistake it for a direct isolated effect.
7. As a participant, I want the breakdown to apply only after I accept a valid five-decision scenario, so that incomplete choices are not presented as final outcomes.
8. As a participant, I want no partial subset used in the calculation to appear as a valid scenario or saved attempt, so that QALA’s scenario rules stay intact.
9. As a participant, I want the rounding of displayed contributions not to conceal their exact reconciliation, so that small rounding differences are understood.
10. As a participant, I want the breakdown available in Russian and Kazakh, so that the explanation matches my chosen language.
11. As a participant, I want a contribution view stored with my accepted attempt, so that I can revisit it when comparing attempts.
12. As a participant, I want a clearly labelled unavailable state and retry when contribution calculation fails, so that my accepted result remains usable.
13. As a participant, I want to open the City Advisor from a completed analysis, so that I can orient myself without re-reading every panel.
14. As a participant, I want the City Advisor to explain only facts from my current attempt, so that it does not invent city conditions or recommendations.
15. As a participant, I want the City Advisor to lead me to relevant facts, remaining problems, and trade-offs, so that I can inspect the basis for every statement.
16. As a participant, I want the City Advisor to distinguish a recommended point replacement from a global comparison, so that I understand their different scopes.
17. As a participant, I want the City Advisor not to reveal a global best scenario unless I have explicitly requested global comparison, so that independent choice remains protected.
18. As a participant, I want the City Advisor to explain the Impact Breakdown in accessible language, so that the academic calculation improves rather than obstructs learning.
19. As a participant, I want to use the City Advisor in Russian and Kazakh, so that the persona does not create a language gap.
20. As a participant, I want a visibly labelled basic Advisor response if AI analysis is unavailable, so that I know what is calculated and what could not be generated.
21. As a participant, I want to generate a short presentation for an accepted attempt, so that I can explain my choices during the local demonstration.
22. As a participant, I want the presentation to show my five decisions, their cost and scope, so that the audience can understand the scenario.
23. As a participant, I want the presentation to show the calculated Score, key changes, and remaining problems, so that it tells a balanced result story.
24. As a participant, I want the presentation to include Impact Breakdown only when it has been calculated, so that it never claims unavailable values.
25. As a participant, I want the presentation to include global comparison only when I have explicitly revealed it, so that it respects the product’s disclosure rule.
26. As a participant, I want the presentation to state that QALA is a synthetic training model rather than a real-city forecast, so that the audience understands its limit.
27. As a participant, I want the presentation to be generated in my chosen Russian or Kazakh language, so that it is ready for its audience.
28. As a participant, I want the presentation to remain tied to one saved accepted attempt, so that generating it cannot overwrite my history.
29. As a participant, I want to open a print-friendly presentation and save it as PDF locally, so that no external publishing service is needed for the defence.
30. As a demonstrator, I want the complete Phase 3 experience to work after the documented local launch, so that academic polish does not compromise reliability.
31. As a maintainer, I want Shapley calculation to remain deterministic when the catalogue and scoring model change, so that contributions are never hard-coded or stale.
32. As a maintainer, I want the Advisor and presentation to consume the authoritative stored facts, so that visual storytelling cannot diverge from calculation.
33. As a reviewer, I want to trace every numeric presentation claim to its accepted result or documented counterfactual contribution, so that the demonstration is auditable.
34. As a reviewer, I want the application to preserve the distinction between a hypothetical subset utility and a user-visible Score, so that the academic method is not misleading.

## Implementation Decisions

- Phase 3 begins only after the end-to-end acceptance criteria of Phases 1 and 2 are met. It is optional academic polish and must not consume the release reserve required for local launch verification, README accuracy, and demonstration rehearsal.
- Impact Breakdown is computed only for a saved accepted scenario containing exactly five management decisions. The calculation uses all 32 subsets of those decisions, including the empty subset and the full scenario, and averages each decision’s marginal utility across the subsets that precede it.
- For this calculation only, a counterfactual utility is defined for each subset: begin from the same baseline state, apply the subset’s effects, lags, synergies, clipping, critical-indicator treatment, weakest-district term, and population weighting, then evaluate the numerical objective. This utility is internal analytic evidence, not a scenario result exposed to the participant.
- A subset is never submitted to the standard valid-scenario acceptance path, does not receive a user-visible Astana Quality of Life Score, does not count as a scenario of fewer than five decisions, and is not saved to history. The existing rule that a visible Score requires a valid five-decision scenario remains intact.
- The full-scenario utility is identical to the authoritative unrounded result of the accepted scenario. The empty utility is identical to the documented baseline calculation. The unrounded sum of all five Shapley Values must equal the full-minus-baseline difference within the project’s exact numeric semantics; presentation rounding occurs afterwards and may show a labelled residual.
- A Shapley contribution is an allocated share of the scenario’s result change under all decision orders. It is not an isolated causal effect, a guaranteed benefit in another scenario, a policy recommendation, or a claim that decisions operate independently.
- Contribution results preserve the scenario, calculator/model version identity, exact internal values, display values, reconciliation data, and calculation status. A version mismatch or failed computation cannot show a stale breakdown. A successful result is associated with the accepted attempt without changing that attempt’s decisions or core result.
- The City Advisor is a guided, non-autonomous presentation layer for an accepted attempt. It offers a limited set of contextual prompts and links rather than unrestricted chat, decision taking, or live city advice.
- Advisor content is grounded in the same calculation facts, accepted result, recommended point replacement, validated AI-analysis blocks, Shapley result when available, and explicitly revealed global comparison when available. It must not infer incidents, probabilities, real-city conditions, hidden metrics, or new numeric values.
- The Advisor applies all Phase 1 safeguards for AI content: stable fact identifiers, fact-backed assertions, Russian and Kazakh language versions, explicit basic-analysis labelling, and retry of AI content without changing the attempt. A deterministic basic Advisor response remains available if AI is unavailable or invalid.
- The global optimum remains undisclosed in Advisor and presentation content until the participant explicitly opens global comparison for that attempt. The Advisor may explain the distinction between local point replacement and global comparison without revealing the withheld global scenario.
- The generated presentation is an in-app, print-friendly three-part view for exactly one accepted attempt: scenario context, calculated result and trade-offs, and improvement/methodology summary. It uses no new arithmetic or free numeric claims; all content is derived from authoritative stored facts.
- Presentation includes only optional material already available to the participant: Shapley breakdown after it succeeds and global comparison after explicit reveal. Missing or failed optional analyses are labelled as unavailable rather than fabricated.
- The presentation is localised for Russian and Kazakh, retains product names QALA and Astana Quality of Life Score, provides a print layout suitable for browser PDF output, and identifies the synthetic-model scope. It does not require cloud generation, accounts, or a third-party slide service.
- All new interfaces are additive. They do not alter the scenario validator, calculator, history semantics, language behaviour, point-replacement rule, global-search tie rule, or source dataset.
- Documentation records the counterfactual-utility definition, Shapley interpretation and limitations, fact-grounding policy of the Advisor, presentation contents, print-to-PDF workflow, actual timing measurements, and the fact that Phase 3 is conditional on prior-phase readiness.

## Testing Decisions

- Good tests observe externally meaningful outcomes: contribution values and reconciliation, disclosure state, grounded Advisor claims, generated presentation content, saved-attempt isolation, language parity, and print-friendly artefacts. Tests do not lock in subset-loop implementation, component nesting, visual styling internals, or prompt wording.
- The deterministic scenario evaluator is the authoritative seam for Impact Breakdown. Tests use small fixed accepted scenarios and official control data to verify the full utility, empty utility, every marginal result, permutation invariance, deterministic reruns, and exact unrounded reconciliation of five contributions to full-minus-baseline utility.
- Mathematical property tests cover symmetry for equivalent decisions where fixtures permit it, a zero-contribution dummy fixture, interaction through known synergies, lag treatment, clipping, critical threshold crossing, negative and zero contributions, display rounding residuals, and version mismatch rejection. Exhaustive assertions are made on test fixtures rather than user-visible partial scenarios.
- Regression tests prove that internal subsets cannot be accepted, saved as attempts, shown as user-visible Scores, or disclosed as an incomplete scenario. Existing five-decision validation and calculator tests remain the source of truth for the product boundary.
- High-level UI tests cover breakdown availability only after accepted results, accessible explanation of its meaning and limitations, fact links, unavailable/retry state, persisted revisit, and Russian/Kazakh rendering. They check the displayed facts rather than the graphical implementation of a chart.
- City Advisor tests use controlled authoritative fact fixtures to confirm it surfaces only allowed facts, links them to their basis, distinguishes point replacement from global comparison, respects the unrevealed-global state, and falls back to a clearly labelled deterministic basic response. Contract tests reject outputs containing unsupported numeric claims or unsupported fact references.
- Presentation tests generate a view from a fixed saved attempt and assert scenario identity, decisions, cost, Score, selected calculated facts, synthetic-model disclaimer, language, and omission of unavailable Shapley or unrevealed global data. Tests establish that generation never mutates the source attempt.
- End-to-end tests cover accepting a scenario, calculating and revisiting Impact Breakdown, using the Advisor, opening a presentation, optionally revealing global comparison, and creating a print-ready result for both Russian and Kazakh. They confirm that optional Phase 3 failure leaves the original result usable.
- Accessibility tests cover keyboard navigation and semantic structure of contribution explanations, Advisor controls, presentation headings, links to facts, and print layout. Manual review checks readability on the intended defence laptop and of the browser PDF output.
- Performance checks measure the 32-subset calculation and presentation generation on the intended local demonstration laptop. The documented figures are observed values, not a promised hard-coded threshold.

## Out of Scope

- Exposing, accepting, scoring, comparing, or storing a partial subset as a user-visible scenario.
- Shapley Values for events outside the five decisions of one accepted scenario, for global optimum enumeration, or as real-world causal estimates.
- Open-ended conversational AI, autonomous choice of measures, ungrounded city advice, personalisation based on personal data, or prediction of real events.
- New free-form AI recommendations outside the calculation-backed point replacement and explicitly requested global comparison.
- PowerPoint, Keynote, cloud-hosted slide collaboration, publication to external services, or automatic sharing; browser print-to-PDF is the supported local export path.
- Real GIS data, live municipal data, real-city forecasts, quarter-by-quarter dynamics, probabilities, incidents, or changes to the organiser’s model.
- Accounts, multi-device history, competition rankings, public deployment, administration, or new language versions beyond Russian and Kazakh.
- Replacing unfinished Phase 1 or Phase 2 functionality, their tests, their fallback behaviour, or their documentation requirements.

## Further Notes

- This PRD resolves the Phase 3 ambiguity noted in the earlier plan: internal subset utility is permitted solely to calculate Shapley Values, while the user-facing definition of a valid scenario remains exactly five decisions.
- The three features share existing high-level seams: the deterministic evaluator supplies contribution evidence, the accepted-result and fact boundary grounds the Advisor, and the saved-attempt presentation boundary supplies the presentation. No new parallel scoring or narrative truth source is introduced.
- Phase 3 should be scheduled only with a protected final reserve for local launch, documentation verification, screenshots, and demonstration rehearsal. If time is constrained, the core product quality of the first two phases takes precedence.
- The PRD is ready for tracker publication with `ready-for-agent`.

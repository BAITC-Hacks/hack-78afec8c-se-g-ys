# PRD: QALA — вторая фаза: визуальное исследование сценария и глобальное сравнение

## Problem Statement

После завершения базового цикла тренажёра участник может самостоятельно собрать и принять допустимый сценарий, увидеть его результат на конец горизонта и получить разбор. Однако табличное или карточное представление недостаточно наглядно показывает территориальный охват решений. Лаги мероприятий видны как числа, но участнику трудно быстро соотнести их с восемью кварталами горизонта. Рекомендуемая точечная замена улучшает один из пяти выборов, но не даёт честного ответа, насколько принятый сценарий близок к наилучшему допустимому сценарию в синтетической модели.

Участнику нужен наглядный способ исследовать уже принятый сценарий: увидеть районы и городские решения, понять время действия каждого мероприятия и, только после собственного выбора, сопоставить свой результат с глобальным максимумом модели. Сравнение не должно превращать тренажёр самостоятельных решений в автоматический подбор ответа и не должно выдавать синтетический максимум за рекомендацию реальной городской политики.

## Solution

Вторая фаза расширяет работающий цикл первой фазы тремя взаимосвязанными возможностями:

- интерактивной SVG-картой пяти районов, дополняющей, а не заменяющей доступные текстовые и числовые данные;
- календарём лагов Q1–Q8, который показывает начало действия выбранных мероприятий и неизменно связывает их эффект с итогом на конец Q8, не создавая поквартальной модели города;
- сравнением What If с детерминированно найденным глобальным максимумом среди всех допустимых сценариев текущего каталога.

Глобальное сравнение открывается только для уже принятой попытки и только по явному действию участника. Оно показывает рассчитанный лучший сценарий, разницу с результатом участника и объясняет, что это максимум заданной синтетической формулы, а не универсально верная политика. Принятый сценарий, история попыток, локальная точечная замена и AI-разбор первой фазы остаются неизменными.

## User Stories

1. As a participant, I want to open a map of the five districts, so that I can connect my decisions to their territorial coverage.
2. As a participant, I want every district on the map to have the same identifiable name as elsewhere in QALA, so that I do not have to translate between views.
3. As a participant, I want to select a district on the map, so that I can inspect its initial and calculated indicators.
4. As a participant, I want to see which accepted district-level decisions target the selected district, so that I can understand the scenario’s local focus.
5. As a participant, I want to see city-wide decisions represented without falsely assigning them to one district, so that their territory is clear.
6. As a participant, I want map selection to work with a keyboard and assistive technology, so that the visual view is not the only way to access scenario information.
7. As a participant, I want a textual alternative to colour-only map encoding, so that the result remains understandable with different visual abilities and displays.
8. As a participant, I want to return from a selected district to the whole-city view, so that I can compare local and city-wide effects.
9. As a participant, I want the map to reflect the current draft before acceptance without revealing a Score, so that independent decision-making remains intact.
10. As a participant, I want the accepted-scenario map to reflect the same decisions and calculated values as the result view, so that two views cannot contradict each other.
11. As a participant, I want the map to remain usable on a laptop-sized screen used for a demo, so that the visual addition supports the defence workflow.
12. As a participant, I want map labels, controls, legends, and district descriptions in Russian and Kazakh, so that language changes affect presentation consistently.
13. As a participant, I want the language switch not to change the selected decisions, map focus, or numerical result, so that it remains a presentation choice.
14. As a participant, I want to see a Q1–Q8 calendar for every decision in my accepted scenario, so that I can understand when its stated lag begins to take effect.
15. As a participant, I want the calendar to distinguish the selected decision’s lag from the simulation horizon, so that I do not mistake delayed effect for a missing decision.
16. As a participant, I want the calendar to state that the reported result is at the end of Q8, so that I understand the meaning of the displayed Score.
17. As a participant, I want the calendar to avoid invented intermediate indicator values and Scores, so that the display does not claim facts the model does not calculate.
18. As a participant, I want to relate each calendar row to the same event, target, cost, direction, and lag shown in the scenario, so that I can trace it back to my decision.
19. As a participant, I want city-wide and district-level decisions to be visually distinguishable in the calendar, so that territorial scope remains clear.
20. As a participant, I want the calendar to work in both language versions, so that its terminology matches the rest of the analysis.
21. As a participant, I want to request a comparison with the best valid scenario only after I have accepted my own scenario, so that QALA preserves the independent-choice experience.
22. As a participant, I want the comparison request to be explicit, so that the global answer is not revealed accidentally.
23. As a participant, I want to see the global maximum Astana Quality of Life Score and my difference from it, so that I can contextualise the outcome of my attempt.
24. As a participant, I want to inspect the five decisions, targets, directions, costs, and total cost of the globally best scenario, so that the comparison is reproducible.
25. As a participant, I want the global scenario to satisfy the same budget, uniqueness, territorial, and incompatibility rules as my scenario, so that the comparison is fair.
26. As a participant, I want a clear distinction between a global maximum and the recommended point replacement, so that I do not confuse exhaustive comparison with a one-change improvement.
27. As a participant, I want the comparison to say that the global maximum applies only to the supplied synthetic catalogue and formula, so that I do not treat it as a real-city policy prescription.
28. As a participant, I want a difference of zero to be described accurately, so that matching the best known Score is not overstated as proof of a universally optimal policy.
29. As a participant, I want ties at the global maximum to be handled in a stable, documented way, so that repeated calculations show the same representative scenario.
30. As a participant, I want the comparison to remain available in my saved attempt history, so that I can revisit what I learned without recalculating or changing the attempt.
31. As a participant, I want an unavailable or failed comparison calculation to preserve my accepted result and provide a clear retry path, so that an enhancement cannot invalidate a completed attempt.
32. As a participant, I want the comparison explanation and notices in Russian and Kazakh, so that language parity covers the new functionality.
33. As a participant, I want the map, calendar, and comparison to use the same calculated facts as the existing result, so that visual and textual analysis remain trustworthy.
34. As a demonstrator, I want the full Phase 2 experience to run locally with the documented command, so that it can be shown reliably during the defence.
35. As a maintainer, I want the global comparison to remain correct when the catalogue or model changes, so that a stale hard-coded answer is never shown as a calculation.

## Implementation Decisions

- Phase 2 begins only after Phase 1’s end-to-end accepted-scenario flow, deterministic calculator, history, localisation, baseline analysis, and reproducible local launch meet their acceptance criteria. It is an enhancement of that flow, not a substitute for unfinished Phase 1 work.
- The domain vocabulary remains unchanged: a scenario is exactly five management decisions; a decision is an event plus its valid territorial target; a valid scenario observes the virtual budget, uniqueness, scope, direction, and incompatibility constraints.
- The interactive map is a project-owned SVG representation of exactly the five model districts. It is a navigation and presentation layer over the authoritative scenario and result data, rather than a source of territorial or numerical truth.
- Map interactions expose the currently selected district through the existing scenario/result presentation boundary. A selected district presents accessible text for its initial indicators, final Q8 indicators where a scenario is accepted, and the decisions targeting it. City-wide decisions are represented as city-wide rather than duplicated as five separate district decisions.
- The map supports focus, keyboard operation, descriptive labels, and a non-colour textual legend. Existing grid or table information remains available as the accessible and compact counterpart to the SVG; no user must infer a fact solely from geometry or colour.
- In a draft, the map may show selected decisions, targets, cost, and validation state, but it must not compute or reveal an unaccepted scenario’s Score or final indicators. In an accepted result, all values derive from the same calculation result already used by the rest of the application.
- The lag calendar has one row per accepted management decision and exactly eight columns, Q1 through Q8. It presents the organiser-specified lag as an onset marker and labels the calculated outcome as the end-of-Q8 result.
- The calendar must never manufacture quarter-by-quarter metric values, Score values, incidents, probability, or a dynamic city trajectory. It visualises only timing already defined by the model; the calculator’s effect realisation remains `(8 − lag) / 8`, while fixed synergy bonuses remain unscaled by lag.
- The global search enumerates every valid, unordered scenario for the active version of the supplied catalogue and evaluates each candidate with the same validator and deterministic calculator that evaluate an accepted scenario. Current planning evidence is 694,395 candidates with territorial assignments; this is an input to measurement and capacity planning, not a promise of a particular response time.
- The global search result contains a representative best valid scenario, its unrounded Score, display-ready rounded Score, total cost, decision details, model/data version identity, and the comparison delta to the accepted scenario. It must retain enough calculated facts to support the displayed comparison without an AI-generated number.
- Candidate selection uses unrounded numeric semantics. If multiple scenarios have equal maximum Score, the representative scenario is selected deterministically: lower total scenario cost first, then the project’s fixed canonical order of event identifiers and district targets. The UI states when a displayed representative belongs to a tie rather than claiming unique superiority.
- Global comparison is unavailable before the first accepted scenario. After acceptance, it requires an explicit user action and is stored with that attempt after a successful calculation. It never edits the participant’s accepted decisions, Score, AI analysis, or history ordering.
- The comparison may offer a non-destructive action to start a new draft from the displayed global scenario. That action creates a new editable draft; it does not rewrite the earlier attempt and does not automatically accept the copied scenario.
- Existing point-replacement search remains a separate, local tool: it searches only one-decision changes and can report no local improvement even when a higher global result exists. The UI uses distinct language and placement for the two results.
- If global search is asynchronous or fails, the accepted scenario result remains visible. The UI indicates that global comparison is unavailable and permits retry; it never substitutes a cached result calculated for a different catalogue or model version.
- Russian and Kazakh translations cover all new controls, map descriptions, calendar terms, global-comparison explanations, failures, and accessibility text. Product names QALA and Astana Quality of Life Score stay unchanged. Switching language changes neither data nor calculation.
- No generative AI is required to calculate, select, or explain numeric global-comparison facts. If AI text later refers to the comparison, it may only cite the calculation facts under the same validation and fallback rules as Phase 1.
- Documentation records the model scope, the explicit-reveal interaction, tie handling, current candidate count, actual measured performance, accessibility behaviour, local launch, and the limits of map, calendar, and global comparison.

## Testing Decisions

- Good tests observe user-visible behaviour and stable public calculation contracts: displayed decisions, validation, timing markers, scores, deltas, saved attempts, and accessible labels. They do not assert SVG internals, component structure, implementation-specific loops, or private storage details.
- The existing deterministic validator and scenario calculator are the highest authoritative seam for global search. Tests use official control scenarios and exhaustive-search fixtures to verify that every returned global candidate is valid, that its Score equals a direct evaluation, and that no valid fixture candidate has a greater unrounded Score.
- Tests cover canonical tie selection, lower-cost tie breaking, final canonical ordering, no premature rounding, zero-delta comparison, and correct handling of a changed catalogue/model version. They also establish that global search never alters a saved accepted scenario.
- Regression tests cover the existing budget limit, five-decision rule, duplicate restriction, territorial scope, prohibited event pairs, lag scaling, unscaled synergies, critical threshold, clipping, and permutation independence. Phase 2 must consume rather than reimplement these rules.
- The calendar is tested at its presentation boundary: each accepted decision gets Q1–Q8 timing, the lag marker matches the decision’s defined lag, Q8 is identified as the result horizon, and no intermediate Score or metric values are rendered. City-wide and district-level labels are tested in both languages.
- High-level UI tests cover selecting a district, discovering its text equivalent, seeing its associated decisions, resetting to whole-city context, preserving selection through expected re-renders, and retaining accessible keyboard focus. Visual regression or snapshot checks may protect the approved SVG arrangement, but semantic interaction tests remain the acceptance seam.
- UI tests confirm a draft map does not expose a Score; the accepted map and calendar exactly match the authoritative accepted result; language switching preserves decisions and numerical values; and unavailable global comparison preserves the already accepted result with a retry control.
- End-to-end tests cover the full user path: assemble and accept a valid scenario, inspect map and calendar, explicitly reveal global comparison, open the global representative, create an optional new draft, and verify that the original history entry is unchanged. The same path is exercised for Russian and Kazakh presentation.
- Accessibility checks verify meaningful names and states for district controls, keyboard selection, non-colour access to mapped meaning, and readable calendar structure. Manual checks validate laptop-size demo usability and assistive-technology announcements that automated checks cannot fully establish.
- Performance measurement is a release criterion rather than an assumed unit-test constant. A documented repeatable benchmark measures cold and warm global-search execution against the current catalogue on the intended demonstration laptop, with the actual observed result recorded in project documentation.

## Out of Scope

- Shapley Values, Impact Breakdown graphs, or any Score semantics for incomplete scenarios.
- A City Advisor character, autonomous agent decisions, or generative recommendation beyond the verified calculations.
- Automated presentation or slide generation.
- Real GIS boundaries, city data integrations, geocoding, personal data, or claims that model districts describe the real city.
- A dynamic per-quarter city simulation, quarter-by-quarter Scores, forecasts, incidents, probabilities, or other values not defined by the supplied model.
- Disclosure of the globally best scenario before an independently accepted first scenario, automatic replacement of a participant’s scenario, or a claim that the global optimum is a real-world policy recommendation.
- Accounts, shared history, multi-device sync, leaderboards, public deployment, administrative tools, or changes to the organiser’s catalogue and scoring model.
- Replacing the Phase 1 table/grid, local point-replacement guidance, deterministic calculator, calculation facts, or AI fallback behaviour.

## Further Notes

- This PRD supersedes only the Phase 2 scope note; the Phase 1 PRD remains the source of truth for the base experience and must stay complete before these additions are scheduled.
- The global maximum is a property of the particular version of the synthetic catalogue, constraints, and Astana Quality of Life Score formula. It is informative What If analysis, not evidence of the best real-city intervention.
- The three additions are intentionally anchored to existing seams: authoritative deterministic calculation for the global search, accepted scenario/result data for the map and calendar, and end-to-end scenario acceptance for user-facing verification. New data presentation must not duplicate independent scoring logic.
- Before implementation, confirm that these seams and the post-acceptance explicit reveal of the global comparison match stakeholder expectations. The PRD is ready to be published to the project tracker with the `ready-for-agent` label once GitHub authentication is restored.

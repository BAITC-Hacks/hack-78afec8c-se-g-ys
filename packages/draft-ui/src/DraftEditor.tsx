import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Decision, DraftEditorProps, DraftValidation, Problem } from "./types";
import { messages } from "./messages";

export function DraftEditor({ catalog, validate, onChange, locale = "ru" }: DraftEditorProps) {
  const text = messages[locale];
  const measureInputId = useId();
  const districtInputId = useId();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [validation, setValidation] = useState<DraftValidation | null>(null);
  const [measureId, setMeasureId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Problem[]>([]);
  const [networkError, setNetworkError] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const measure = catalog.measures.find(item => item.id === measureId);

  useEffect(() => () => { activeRequest.current?.abort(); }, []);

  function resetForm() {
    setMeasureId("");
    setDistrictId("");
    setEditing(null);
  }

  async function attempt(candidate: Decision[]) {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setErrors([]);
    setNetworkError(false);
    try {
      const result = await validate(candidate, controller.signal);
      if (controller.signal.aborted) return;
      if (result.valid) {
        setDecisions(candidate);
        setValidation(result);
        resetForm();
        onChange?.(candidate, result);
      } else {
        setErrors(result.errors);
      }
    } catch {
      if (!controller.signal.aborted) setNetworkError(true);
    } finally {
      activeRequest.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!measure || pending) return;
    const decision: Decision = { measure_id: measure.id };
    if (measure.scope === "district") decision.district_id = districtId;
    const candidate = editing === null ? [...decisions, decision]
      : decisions.map((item, index) => index === editing ? decision : item);
    void attempt(candidate);
  }

  return (
    <section className="qala-draft" lang={locale}>
      <h2>{text.title}</h2>
      <p>{text.help}</p>
      <div className="qala-draft__totals">
        <div><span>{text.count}</span><output aria-label={text.count}>{decisions.length} / 5</output></div>
        <div><span>{text.spent}</span><output aria-label={text.spent}>{validation?.spent ?? 0}</output></div>
        <div><span>{text.remaining}</span><output aria-label={text.remaining}>{validation?.remaining ?? catalog.budget}</output></div>
      </div>
      {pending && <p role="status">{text.checking}</p>}
      {networkError && <p role="alert">{text.network}</p>}
      {errors.length > 0 && <div role="alert">
        {errors.map((error, index) => <p key={index} data-code={error.code}>
          {text.errors[error.code] ?? text.invalid}
        </p>)}
      </div>}
      {validation?.warnings.map(warning => <p key={warning.code} role="status" aria-label={text.warning}>
        {text.errors[warning.code] ?? text.invalid}
      </p>)}
      {decisions.length === 0 && <p className="qala-draft__empty">{text.empty}</p>}
      <ol aria-label={text.selected}>
        {decisions.map((decision, index) => {
          const item = catalog.measures.find(item => item.id === decision.measure_id)!;
          const district = catalog.districts.find(item => item.id === decision.district_id);
          return <li key={item.id} data-editing={editing === index}>
            <span className="qala-draft__decision"><strong>{item.id} · {item.name[locale]}</strong>
              <small>{district?.name[locale] ?? text.allDistricts} · {item.cost}</small></span>
            <button type="button" disabled={pending} aria-label={`${text.edit} ${item.id}`} onClick={() => {
              setEditing(index); setMeasureId(item.id); setDistrictId(decision.district_id ?? "");
            }}>{text.edit}</button>
            <button type="button" disabled={pending} aria-label={`${text.remove} ${item.id}`} onClick={() => {
              void attempt(decisions.filter((_, selected) => selected !== index));
            }}>{text.remove}</button>
          </li>;
        })}
      </ol>
      {validation?.complete && <p>{text.complete}</p>}
      <form onSubmit={submit}>
        <fieldset disabled={pending || (decisions.length === 5 && editing === null)}>
          <legend>{editing === null ? text.add : text.save}</legend>
          <label htmlFor={measureInputId}>{text.measure}</label>
            <select id={measureInputId} value={measureId} onChange={event => { setMeasureId(event.target.value); setDistrictId(""); }}>
              <option value="">{text.chooseMeasure}</option>
              {catalog.measures.map(item => <option key={item.id} value={item.id}>{item.id} · {item.name[locale]} · {item.cost}</option>)}
            </select>
          {measure?.scope === "district" && <>
            <label htmlFor={districtInputId}>{text.district}</label>
            <select id={districtInputId} value={districtId} onChange={event => setDistrictId(event.target.value)}>
              <option value="">{text.chooseDistrict}</option>
              {catalog.districts.map(item => <option key={item.id} value={item.id}>{item.name[locale]}</option>)}
            </select>
          </>}
          {measure?.scope === "city" && <p>{text.allDistricts}</p>}
          <button type="submit" disabled={!measure || (measure.scope === "district" && !districtId)}>
            {editing === null ? text.add : text.save}
          </button>
          {editing !== null && <button type="button" onClick={resetForm}>{text.cancel}</button>}
        </fieldset>
      </form>
    </section>
  );
}

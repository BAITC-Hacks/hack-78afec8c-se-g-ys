import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, expect, test } from "vitest";
import { DraftEditor } from "../src/DraftEditor";
import { createDraftValidator } from "../src/client";
import data from "../../draft-api/examples/catalog.json";
import type { Decision, DraftCatalog, DraftValidation } from "../src/types";
import { startValidationServer } from "./server";

const catalog = data as DraftCatalog;
let server: Awaited<ReturnType<typeof startValidationServer>>;
beforeAll(async () => { server = await startValidationServer(); });
afterAll(async () => { await server?.stop(); });

function renderEditor() {
  return render(<DraftEditor catalog={catalog} validate={createDraftValidator(`${server.url}/api/drafts/validate`)} />);
}

async function addDecision(user: ReturnType<typeof userEvent.setup>, measure: string, district?: string) {
  const count = Number(screen.getByLabelText("Решения").textContent?.split(" / ")[0]);
  await user.selectOptions(screen.getByLabelText("Мероприятие"), measure);
  if (district) await user.selectOptions(screen.getByLabelText("Район"), district);
  await user.click(screen.getByRole("button", { name: "Добавить решение" }));
  await waitFor(() => expect(screen.getByLabelText("Решения")).toHaveTextContent(`${count + 1} / 5`));
}

test("starts with an empty Russian draft and no calculated results", () => {
  render(<DraftEditor catalog={catalog} validate={async () => { throw new Error("Unexpected validation"); }} />);
  expect(screen.getByRole("heading", { name: "Черновик сценария" })).toBeVisible();
  expect(screen.getByLabelText("Решения")).toHaveTextContent("0 / 5");
  expect(screen.getByLabelText("Расход")).toHaveTextContent("0");
  expect(screen.getByLabelText("Остаток бюджета")).toHaveTextContent("100");
  expect(screen.queryByText(/Score|рекомендация/i)).not.toBeInTheDocument();
});

test("adds district and city decisions through the real API", async () => {
  const user = userEvent.setup();
  renderEditor();
  await user.selectOptions(screen.getByLabelText("Мероприятие"), "M1");
  expect(screen.getByRole("button", { name: "Добавить решение" })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Район"), "nura");
  await user.click(screen.getByRole("button", { name: "Добавить решение" }));
  await waitFor(() => expect(screen.getByLabelText("Расход")).toHaveTextContent(/^18$/));
  expect(screen.getByLabelText("Решения")).toHaveTextContent("1 / 5");
  expect(screen.getByLabelText("Остаток бюджета")).toHaveTextContent("82");

  await user.selectOptions(screen.getByLabelText("Мероприятие"), "M2");
  expect(screen.queryByLabelText("Район")).not.toBeInTheDocument();
  expect(screen.getByText("Все районы")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Добавить решение" }));
  await waitFor(() => expect(screen.getByLabelText("Расход")).toHaveTextContent(/^40$/));
  expect(screen.getByLabelText("Решения")).toHaveTextContent("2 / 5");
});

test("replaces and removes a decision while updating totals", async () => {
  const user = userEvent.setup();
  renderEditor();
  await addDecision(user, "M1", "nura");
  await user.click(screen.getByRole("button", { name: "Изменить M1" }));
  await user.selectOptions(screen.getByLabelText("Мероприятие"), "M12");
  expect(screen.queryByLabelText("Район")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Сохранить замену" }));
  await waitFor(() => expect(screen.getByLabelText("Расход")).toHaveTextContent(/^14$/));
  expect(screen.getByLabelText("Решения")).toHaveTextContent("1 / 5");
  expect(screen.queryByRole("button", { name: "Изменить M1" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Удалить M12" }));
  await waitFor(() => expect(screen.getByLabelText("Решения")).toHaveTextContent("0 / 5"));
  expect(screen.getByLabelText("Остаток бюджета")).toHaveTextContent("100");
});

test("rejects incompatible edits without losing the existing draft", async () => {
  const user = userEvent.setup();
  renderEditor();
  await addDecision(user, "M1", "nura");
  await user.selectOptions(screen.getByLabelText("Мероприятие"), "M3");
  await user.selectOptions(screen.getByLabelText("Район"), "almaty");
  await user.click(screen.getByRole("button", { name: "Добавить решение" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("M1 и M3 нельзя выбирать вместе");
  expect(screen.getByLabelText("Решения")).toHaveTextContent("1 / 5");
  expect(screen.getByLabelText("Расход")).toHaveTextContent(/^18$/);
  expect(screen.getByRole("button", { name: "Изменить M1" })).toBeEnabled();
});

test("shows the cost-83 warning and clears it after a valid edit", async () => {
  const user = userEvent.setup();
  renderEditor();
  await addDecision(user, "M3", "nura");
  await addDecision(user, "M5", "saryarka");
  await addDecision(user, "M13", "almaty");
  expect(screen.getByLabelText("Расход")).toHaveTextContent(/^83$/);
  expect(screen.getByLabelText("Остаток бюджета")).toHaveTextContent("17");
  expect(screen.getByRole("status", { name: "Предупреждение" })).toHaveTextContent("не хватит");
  expect(screen.getByRole("button", { name: "Изменить M13" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Удалить M13" }));
  await waitFor(() => expect(screen.getByLabelText("Расход")).toHaveTextContent(/^55$/));
  expect(screen.queryByRole("status", { name: "Предупреждение" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Score/i)).not.toBeInTheDocument();
});

test("a network failure preserves the draft and allows retry", async () => {
  const user = userEvent.setup();
  const validate = createDraftValidator(`${server.url}/api/drafts/validate`);
  let unavailable = false;
  render(<DraftEditor catalog={catalog} validate={(decisions, signal) => {
    if (unavailable) return Promise.reject(new TypeError("Network unavailable"));
    return validate(decisions, signal);
  }} />);
  await addDecision(user, "M1", "nura");
  unavailable = true;
  await user.click(screen.getByRole("button", { name: "Удалить M1" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Проверка недоступна");
  expect(screen.getByLabelText("Расход")).toHaveTextContent(/^18$/);
  expect(screen.getByRole("button", { name: "Удалить M1" })).toBeEnabled();
  unavailable = false;
  await user.click(screen.getByRole("button", { name: "Удалить M1" }));
  await waitFor(() => expect(screen.getByLabelText("Решения")).toHaveTextContent("0 / 5"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("switching language preserves the draft, warning, and unfinished selection", async () => {
  const user = userEvent.setup();
  const validate = createDraftValidator(`${server.url}/api/drafts/validate`);
  const view = render(<DraftEditor catalog={catalog} validate={validate} locale="ru" />);
  await addDecision(user, "M3", "nura");
  await addDecision(user, "M5", "saryarka");
  await addDecision(user, "M13", "almaty");
  await user.selectOptions(screen.getByLabelText("Мероприятие"), "M9");
  await user.selectOptions(screen.getByLabelText("Район"), "nura");
  view.rerender(<DraftEditor catalog={catalog} validate={validate} locale="kk" />);
  expect(screen.getByRole("heading", { name: "Сценарий жобасы" })).toBeVisible();
  expect(screen.getByLabelText("Шешімдер")).toHaveTextContent("3 / 5");
  expect(screen.getByLabelText("Шығын")).toHaveTextContent(/^83$/);
  expect(screen.getByRole("status", { name: "Ескерту" })).toHaveTextContent("жетпейді");
  expect(screen.getByLabelText("Іс-шара")).toHaveValue("M9");
  expect(screen.getByLabelText("Аудан")).toHaveValue("nura");
});

test("five valid decisions across three directions remain editable without exposing results", async () => {
  const user = userEvent.setup();
  renderEditor();
  await addDecision(user, "M9", "nura");
  await addDecision(user, "M8", "nura");
  await addDecision(user, "M11", "nura");
  await addDecision(user, "M10", "nura");
  await addDecision(user, "M12");
  expect(screen.getByText("Пять решений выбраны. Черновик можно изменить.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Добавить решение" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Изменить M9" })).toBeEnabled();
  expect(screen.queryByText(/Score/i)).not.toBeInTheDocument();
});

test("pending validation blocks further edits and cannot publish after unmount", async () => {
  const user = userEvent.setup();
  const realValidate = createDraftValidator(`${server.url}/api/drafts/validate`);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let response: Promise<DraftValidation> | undefined;
  const published: Decision[][] = [];
  const view = render(<DraftEditor catalog={catalog} onChange={decisions => published.push(decisions)}
    validate={decisions => {
      // Delay a real HTTP result, including a transport that ignores cancellation.
      response = realValidate(decisions, new AbortController().signal).then(async result => {
        await gate;
        return result;
      });
      return response;
    }} />);
  await user.selectOptions(screen.getByLabelText("Мероприятие"), "M12");
  await user.click(screen.getByRole("button", { name: "Добавить решение" }));
  const checking = screen.queryByText("Проверяем изменение…");
  const disabled = screen.getByLabelText("Мероприятие").matches(":disabled");
  view.unmount();
  await act(async () => { release(); await response; });
  expect(checking).not.toBeNull();
  expect(disabled).toBe(true);
  expect(published).toEqual([]);
});

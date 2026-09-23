import type { DraftValidation, ValidateDraft } from "./types";

export function createDraftValidator(url = "/api/drafts/validate"): ValidateDraft {
  return async (decisions, signal) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions }),
      signal,
    });
    if (!response.ok) throw new Error(`Draft validation failed (${response.status})`);
    return await response.json() as DraftValidation;
  };
}

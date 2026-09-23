export type Locale = "ru" | "kk";
export type LocalizedName = Record<Locale, string>;

export interface DraftCatalog {
  budget: number;
  districts: { id: string; name: LocalizedName }[];
  measures: {
    id: string;
    direction: string;
    cost: number;
    scope: "city" | "district";
    name: LocalizedName;
  }[];
}

export interface Decision {
  measure_id: string;
  district_id?: string | null;
}

export interface Problem {
  code: string;
  decision_indexes: number[];
}

export interface DraftValidation {
  valid: boolean;
  complete: boolean;
  decision_count: number;
  spent: number;
  remaining: number;
  errors: Problem[];
  warnings: Problem[];
}

export type ValidateDraft = (decisions: Decision[], signal: AbortSignal) => Promise<DraftValidation>;

export interface DraftEditorProps {
  catalog: DraftCatalog;
  validate: ValidateDraft;
  locale?: Locale;
  onChange?: (decisions: Decision[], validation: DraftValidation) => void;
}

export interface TextMeasurement {
  charCount: number;
  byteCount: number;
}

export interface RuleMatch {
  ruleId: string;
  outcome: "block" | "review";
  matchedText?: string;
  start?: number;
  end?: number;
  detail?: string;
}

export interface ContextRequirement {
  ruleId: string;
  category: "provenance";
  message: string;
  recommendation: string;
  requiredFields: string[];
}

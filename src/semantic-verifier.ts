import { createHash, randomBytes } from "node:crypto";
import type { DataBundle } from "./data-types.ts";
import type { FieldKey, PhraseRule, ValidationProfile } from "./rule-types.ts";

export type HybridDisposition = "prohibited" | "revise" | "teacher_review" | "pass_no_match";

export interface SemanticCandidate {
  candidateId: string;
  ruleId: string;
  spanText: string;
  occurrence?: number;
  retryToken?: string;
}

export interface SemanticVerifyEntryRequest {
  entryId: string;
  text: string;
  field: FieldKey;
  profile: ValidationProfile;
  initialStatus: "pass_no_match" | "revise" | "prohibited";
  candidates: SemanticCandidate[];
}

export interface SemanticVerifyRequest {
  entries: SemanticVerifyEntryRequest[];
}

interface CandidateResult {
  candidateId: string;
  ruleId: string;
  spanText: string;
  candidateStatus: "verified" | "invalid";
  verification: "confirmed" | "supported_but_uncertain" | "not_supported" | null;
  finalRecommendation: HybridDisposition | null;
  errorCode?: string;
  retryable?: boolean;
  retryToken?: string;
  availableOccurrences?: number[];
}

export interface SemanticVerifyResult {
  rulePackId: string;
  processingStatus: "complete" | "retry_required";
  status: HybridDisposition | null;
  entries: Array<{
    entryId: string;
    initialStatus: SemanticVerifyEntryRequest["initialStatus"];
    processingStatus: "complete" | "retry_required";
    finalRecommendation: HybridDisposition | null;
    candidates: CandidateResult[];
  }>;
  disclaimer: string;
}

const DISCLAIMER = "AI가 제출한 의미 후보를 규칙팩으로 재검증한 결과이며, 최종 기재 여부는 교사가 최신 기재요령과 실제 관찰 근거를 확인해야 합니다.";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function occurrenceStarts(text: string, span: string): number[] {
  const starts: number[] = [];
  let from = 0;
  while (from <= text.length - span.length) {
    const index = text.indexOf(span, from);
    if (index < 0) break;
    starts.push(index);
    from = index + Math.max(span.length, 1);
  }
  return starts;
}

function contextFor(text: string, start: number, end: number): string {
  const left = text.slice(Math.max(0, start - 40), start);
  const right = text.slice(end, Math.min(text.length, end + 40));
  const leftBoundary = Math.max(left.lastIndexOf("\n"), left.lastIndexOf("."), left.lastIndexOf("다."));
  const rightBoundaryCandidates = [right.indexOf("\n"), right.indexOf("."), right.indexOf("다.")].filter((value) => value >= 0);
  const rightBoundary = rightBoundaryCandidates.length > 0 ? Math.min(...rightBoundaryCandidates) + 1 : right.length;
  return left.slice(leftBoundary + 1) + text.slice(start, end) + right.slice(0, rightBoundary);
}

function matches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, "giu").test(value);
  } catch {
    return false;
  }
}

function ruleFor(bundle: DataBundle, ruleId: string): PhraseRule | undefined {
  const rule = bundle.rules.rules.find((candidate) => candidate.id === ruleId);
  return rule && "detector" in rule ? rule : undefined;
}

function retryToken(bundle: DataBundle, entry: SemanticVerifyEntryRequest, candidate: SemanticCandidate): string {
  return `${sha256(JSON.stringify([bundle.rules.id, entry.entryId, sha256(entry.text), candidate.candidateId, candidate.ruleId]))}.${randomBytes(8).toString("hex")}`;
}

function verifyCandidate(bundle: DataBundle, entry: SemanticVerifyEntryRequest, candidate: SemanticCandidate): CandidateResult {
  const invalid = (errorCode: string, extra: Partial<CandidateResult> = {}): CandidateResult => ({
    candidateId: candidate.candidateId,
    ruleId: candidate.ruleId,
    spanText: candidate.spanText,
    candidateStatus: "invalid",
    verification: null,
    finalRecommendation: candidate.retryToken ? "teacher_review" : null,
    errorCode,
    retryable: !candidate.retryToken,
    ...(!candidate.retryToken ? { retryToken: retryToken(bundle, entry, candidate) } : {}),
    ...extra,
  });
  const rule = ruleFor(bundle, candidate.ruleId);
  if (!rule) return invalid("unknown_rule_id");
  if (rule.authorityClass === "editorial-caution" && entry.profile !== "official_plus_editorial") return invalid("rule_not_applicable");
  if (rule.appliesTo !== "all" && !rule.appliesTo.includes(entry.field)) return invalid("rule_not_applicable");
  if (!candidate.spanText) return invalid("empty_span");
  const occurrences = occurrenceStarts(entry.text, candidate.spanText);
  if (occurrences.length === 0) return invalid("span_not_found");
  if (occurrences.length > 1 && candidate.occurrence === undefined) return invalid("ambiguous_span", { availableOccurrences: occurrences.map((_, index) => index + 1) });
  const occurrence = candidate.occurrence ?? 1;
  if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > occurrences.length) return invalid("occurrence_out_of_range", { availableOccurrences: occurrences.map((_, index) => index + 1) });
  const start = occurrences[occurrence - 1]!;
  const end = start + candidate.spanText.length;
  const context = contextFor(entry.text, start, end);
  const definition = rule.semanticReview;
  if (!definition) return invalid("rule_not_semantic");
  const confirmed = definition.confirmPatterns.some((pattern) => matches(pattern.pattern, context));
  const supported = definition.supportPatterns.some((pattern) => matches(pattern.pattern, context));
  const negative = definition.negativePatterns.some((pattern) => matches(pattern.pattern, context));
  const verification = confirmed && !negative ? "confirmed" : confirmed || supported ? "supported_but_uncertain" : "not_supported";
  const finalRecommendation: HybridDisposition = verification === "confirmed"
    ? rule.authorityClass === "official-policy" && rule.outcome === "block" ? "prohibited" : "revise"
    : verification === "supported_but_uncertain" ? "teacher_review" : "pass_no_match";
  return { candidateId: candidate.candidateId, ruleId: candidate.ruleId, spanText: candidate.spanText, candidateStatus: "verified", verification, finalRecommendation };
}

export function createSemanticVerifier(bundle: DataBundle) {
  return {
    verify(request: SemanticVerifyRequest): SemanticVerifyResult {
      const entries = request.entries.map((entry) => {
        const candidates = entry.candidates.map((candidate) => verifyCandidate(bundle, entry, candidate));
        const retryRequired = candidates.some((candidate) => candidate.candidateStatus === "invalid" && candidate.retryable);
        const finalRecommendation = retryRequired
          ? null
          : candidates.find((candidate) => candidate.finalRecommendation === "prohibited")?.finalRecommendation
            ?? candidates.find((candidate) => candidate.finalRecommendation === "revise")?.finalRecommendation
            ?? candidates.find((candidate) => candidate.finalRecommendation === "teacher_review")?.finalRecommendation
            ?? entry.initialStatus;
        return { entryId: entry.entryId, initialStatus: entry.initialStatus, processingStatus: retryRequired ? "retry_required" as const : "complete" as const, finalRecommendation, candidates };
      });
      const status = entries.some((entry) => entry.finalRecommendation === "prohibited") ? "prohibited" as const
        : entries.some((entry) => entry.finalRecommendation === "revise") ? "revise" as const
          : entries.some((entry) => entry.finalRecommendation === "teacher_review") ? "teacher_review" as const
            : entries.some((entry) => entry.processingStatus === "retry_required") ? null : "pass_no_match" as const;
      return { rulePackId: bundle.rules.id, processingStatus: entries.some((entry) => entry.processingStatus === "retry_required") ? "retry_required" : "complete", status, entries, disclaimer: DISCLAIMER };
    },
  };
}

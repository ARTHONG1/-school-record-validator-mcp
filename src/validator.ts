import {
  validateActivityContext,
  validateVolunteerContext,
} from "./activity-context.ts";
import type { ContextRequirement, RuleMatch } from "./check-types.ts";
import type { DataBundle } from "./data-types.ts";
import { createEvidenceService, type EvidenceSummary } from "./evidence.ts";
import { validateLength } from "./length.ts";
import { validateProvenance, type ProvenanceInput } from "./provenance.ts";
import type {
  FieldSpec,
  PhraseRule,
  ValidationProfile,
  ValidationRule,
} from "./rule-types.ts";
import { scanPhraseRules } from "./scanner.ts";
import type {
  BatchEntry,
  BatchValidationResult,
  Finding,
  RecordValidator,
  ValidationInput,
  ValidationResult,
} from "./validator-types.ts";

const DISCLAIMER =
  "자동 검증 결과는 공식 승인이나 법률 자문이 아니며, 최종 기재 여부는 학교가 공식 원문과 사실관계를 확인해야 합니다.";

const AI_RULE_IDS = new Set(["OFFICIAL-AI-VERBATIM", "OFFICIAL-AI-VERIFICATION"]);
const FIXED_ALLOWED_INSTITUTIONS = new Set([
  "교육부",
  "대한민국학술원",
  "국사편찬위원회",
  "국립국제교육원",
  "국립특수교육원",
  "교원소청심사위원회",
  "중앙교육연수원",
]);

interface CategorizedMatch {
  match: RuleMatch;
  category: Finding["category"];
}

function isPhraseRule(rule: ValidationRule): rule is PhraseRule {
  return "detector" in rule;
}

function validateInputShape(input: ValidationInput, field: FieldSpec | undefined): asserts field is FieldSpec {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid validation input");
  }
  if (!field) {
    throw new Error("Invalid validation input: unsupported field");
  }
  if (typeof input.text !== "string" || input.text.length < 1 || input.text.length > 200_000) {
    throw new Error("Invalid validation input: text must contain 1 to 200000 characters");
  }
  if (input.profile !== undefined && input.profile !== "official" && input.profile !== "official_plus_editorial") {
    throw new Error("Invalid validation input: unsupported profile");
  }
  if (input.grade !== undefined && (!Number.isInteger(input.grade) || input.grade < 1 || input.grade > 6)) {
    throw new Error("Invalid validation input: grade must be an integer from 1 to 6");
  }
  if (input.curriculum !== undefined && input.curriculum !== "general" && input.curriculum !== "special_basic") {
    throw new Error("Invalid validation input: unsupported curriculum");
  }
  if (field.applicableTo === "special-basic-curriculum" && input.curriculum !== "special_basic") {
    throw new Error("Invalid validation input: this field requires curriculum special_basic");
  }
}

function validateAiUse(provenanceValue?: ProvenanceInput): RuleMatch[] {
  const provenance = provenanceValue ?? {};
  if (provenance.aiUse === "verbatim") {
    return [{ ruleId: "OFFICIAL-AI-VERBATIM", outcome: "block" }];
  }
  if (provenance.aiUse === "proofreading" || provenance.aiUse === "draft_generation_rewritten") {
    return provenance.teacherVerifiedAgainstActualPerformance === true
      ? []
      : [{ ruleId: "OFFICIAL-AI-VERIFICATION", outcome: "review" }];
  }
  return [];
}

function provenanceMatches(field: FieldSpec, provenance?: ProvenanceInput): {
  matches: RuleMatch[];
  needsContext: string[];
} {
  if (field.provenanceMode === "none") {
    return { matches: [], needsContext: [] };
  }
  if (field.provenanceMode === "activity-evidence") {
    return { matches: validateAiUse(provenance), needsContext: [] };
  }

  const assessment = validateProvenance(field, provenance);
  const nonAiMatches = assessment.matches.filter(
    (match) => !AI_RULE_IDS.has(match.ruleId),
  );
  return {
    matches: [...nonAiMatches, ...validateAiUse(provenance)],
    needsContext: assessment.needsContext,
  };
}

function normalizeInstitutionName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}

function isFixedAllowedInstitution(value: string): boolean {
  const normalized = normalizeInstitutionName(value);
  return FIXED_ALLOWED_INSTITUTIONS.has(normalized)
    || normalized.endsWith("교육청")
    || normalized.endsWith("교육지원청");
}

function suppressSpecificNameMatch(
  match: RuleMatch,
  input: ValidationInput,
  activityMatches: readonly RuleMatch[],
): boolean {
  if (match.ruleId !== "OFFICIAL-SPECIFIC-NAME" || !match.matchedText) return false;
  if (isFixedAllowedInstitution(match.matchedText)) return true;
  if (
    input.field !== "creative_autonomy_club_special"
    && input.field !== "creative_career_special"
  ) {
    return false;
  }
  if (activityMatches.length > 0) return false;

  const matchedName = normalizeInstitutionName(match.matchedText);
  return input.activityContext?.organizers?.some((organizer) => (
    organizer.name !== undefined
    && normalizeInstitutionName(organizer.name) === matchedName
  )) ?? false;
}

function truncateCodePoints(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

function ruleEvidence(rule: ValidationRule, getEvidence: (ids: readonly string[]) => EvidenceSummary[]): EvidenceSummary[] {
  if (rule.authorityClass === "editorial-caution") {
    return [];
  }
  if (!("evidenceIds" in rule) || !rule.evidenceIds || rule.evidenceIds.length === 0) {
    throw new Error(`Official rule has no evidence: ${rule.id}`);
  }
  const evidence = getEvidence(rule.evidenceIds);
  if (evidence.length === 0) {
    throw new Error(`Official rule has no evidence: ${rule.id}`);
  }
  return evidence;
}

function evidenceAuthority(evidence: readonly EvidenceSummary[]): 100 | 80 {
  let authority: 100 | 80 = 80;
  for (const item of evidence) {
    if (item.authority === 100) {
      authority = 100;
      break;
    }
  }
  return authority;
}

function buildFinding(
  categorized: CategorizedMatch,
  ruleById: ReadonlyMap<string, ValidationRule>,
  getEvidence: (ids: readonly string[]) => EvidenceSummary[],
): Finding {
  const { match } = categorized;
  const rule = ruleById.get(match.ruleId);
  if (!rule) {
    throw new Error(`Rule pack is missing rule definition: ${match.ruleId}`);
  }

  if (rule.authorityClass === "editorial-caution") {
    return {
      ruleId: rule.id,
      authorityClass: rule.authorityClass,
      authority: 10,
      outcome: match.outcome,
      category: "editorial",
      message: rule.message,
      recommendation: rule.recommendation,
      ...(match.matchedText !== undefined
        ? { matchedText: truncateCodePoints(match.matchedText, 80) }
        : {}),
      ...(match.start !== undefined ? { start: match.start } : {}),
      ...(match.end !== undefined ? { end: match.end } : {}),
      evidence: [],
      localPolicyId: rule.localPolicyId,
    };
  }

  const evidence = ruleEvidence(rule, getEvidence);
  return {
    ruleId: rule.id,
    authorityClass: rule.authorityClass,
    authority: evidenceAuthority(evidence),
    outcome: match.outcome,
    category: categorized.category,
    message: rule.message,
    recommendation: rule.recommendation,
    ...(match.matchedText !== undefined
      ? { matchedText: truncateCodePoints(match.matchedText, 80) }
      : {}),
    ...(match.start !== undefined ? { start: match.start } : {}),
    ...(match.end !== undefined ? { end: match.end } : {}),
    evidence,
  };
}

function deduplicateFindings(findings: readonly Finding[]): Finding[] {
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.ruleId}\u0000${finding.start ?? ""}\u0000${finding.end ?? ""}`;
    if (!unique.has(key)) {
      unique.set(key, finding);
    }
  }
  return [...unique.values()];
}

function mergeEvidence(findings: readonly Finding[]): EvidenceSummary[] {
  const evidenceById = new Map<string, EvidenceSummary>();
  for (const finding of findings) {
    for (const evidence of finding.evidence) {
      evidenceById.set(evidence.evidenceId, evidence);
    }
  }
  return [...evidenceById.values()].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function suppressConflicts(
  findings: readonly Finding[],
  ruleById: ReadonlyMap<string, ValidationRule>,
): Finding[] {
  const matchedRuleIds = new Set(findings.map((finding) => finding.ruleId));
  const adjacency = new Map<string, Set<string>>();

  for (const ruleId of matchedRuleIds) {
    const rule = ruleById.get(ruleId);
    if (!rule?.conflictsWith) continue;
    for (const otherRuleId of rule.conflictsWith) {
      if (!matchedRuleIds.has(otherRuleId)) continue;
      const otherRule = ruleById.get(otherRuleId);
      if (!otherRule?.conflictsWith?.includes(ruleId)) continue;
      const neighbors = adjacency.get(ruleId) ?? new Set<string>();
      neighbors.add(otherRuleId);
      adjacency.set(ruleId, neighbors);
      const otherNeighbors = adjacency.get(otherRuleId) ?? new Set<string>();
      otherNeighbors.add(ruleId);
      adjacency.set(otherRuleId, otherNeighbors);
    }
  }

  const consumed = new Set<string>();
  const conflictFindings: Finding[] = [];
  for (const startingRuleId of [...adjacency.keys()].sort()) {
    if (consumed.has(startingRuleId)) continue;
    const component = new Set<string>();
    const pending = [startingRuleId];
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || component.has(current)) continue;
      component.add(current);
      for (const neighbor of adjacency.get(current) ?? []) pending.push(neighbor);
    }
    if (component.size < 2) continue;

    const conflictingRuleIds = [...component].sort();
    const originals = findings.filter((finding) => component.has(finding.ruleId));
    const evidence = mergeEvidence(originals);
    if (evidence.length === 0) {
      throw new Error(`Conflicting official rules have no evidence: ${conflictingRuleIds.join(",")}`);
    }
    conflictFindings.push({
      ruleId: "SOURCE-RULE-CONFLICT",
      authorityClass: "official-policy",
      authority: originals.some((finding) => finding.authority === 100) ? 100 : 80,
      outcome: "review",
      category: "conflict",
      message: "서로 충돌하도록 선언된 규칙이 같은 입력에서 탐지되었습니다.",
      recommendation: "양쪽 공식 근거를 사람이 함께 확인한 뒤 기재 여부를 결정하세요.",
      evidence,
      conflictingRuleIds,
    });
    for (const ruleId of component) consumed.add(ruleId);
  }

  return [
    ...findings.filter((finding) => !consumed.has(finding.ruleId)),
    ...conflictFindings,
  ];
}

function compareFindings(left: Finding, right: Finding): number {
  const outcomeOrder = (value: Finding["outcome"]): number => value === "block" ? 0 : 1;
  return (
    outcomeOrder(left.outcome) - outcomeOrder(right.outcome) ||
    right.authority - left.authority ||
    (left.start ?? Number.MAX_SAFE_INTEGER) - (right.start ?? Number.MAX_SAFE_INTEGER) ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

function findingStatus(findings: readonly Finding[]): "pass" | "review" | "blocked" {
  if (findings.some((finding) => finding.outcome === "block")) return "blocked";
  return findings.length > 0 ? "review" : "pass";
}

function aggregateStatus(
  contentStatus: ValidationResult["contentStatus"],
  context: ValidationResult["contextStatus"],
): ValidationResult["status"] {
  if (contentStatus === "blocked" || context === "blocked") return "blocked";
  if (contentStatus === "review" || context === "review") return "review";
  if (context === "needs_context") return "needs_context";
  return "pass";
}

function batchStatus(results: readonly ValidationResult[]): BatchValidationResult["status"] {
  if (results.some((result) => result.status === "blocked")) return "blocked";
  if (results.some((result) => result.status === "review")) return "review";
  return results.some((result) => result.status === "needs_context") ? "needs_context" : "pass";
}

function assertBatchInput(entries: readonly BatchEntry[], fields: Record<string, FieldSpec>): void {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 100) {
    throw new Error("Invalid batch input: entries must contain 1 to 100 items");
  }

  const entryIds = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.entryId !== "string" || entry.entryId.length < 1 || entry.entryId.length > 100) {
      throw new Error("Invalid batch input: entryId must contain 1 to 100 characters");
    }
    if (entryIds.has(entry.entryId)) {
      throw new Error("Invalid batch input: entryId must be unique");
    }
    entryIds.add(entry.entryId);
  }

  for (const entry of entries) {
    validateInputShape(entry, fields[entry.field]);
  }
}

export function createValidator(bundle: DataBundle): RecordValidator {
  const evidenceService = createEvidenceService(bundle);
  const ruleById = new Map(bundle.rules.rules.map((rule) => [rule.id, rule]));
  const phraseRules = bundle.rules.rules.filter(isPhraseRule);

  function validate(input: ValidationInput): ValidationResult {
    const field = bundle.rules.fields[input.field];
    validateInputShape(input, field);
    const profile: ValidationProfile = input.profile ?? bundle.rules.defaultProfile;
    const lengthResult = validateLength(field, input.text);
    const activityMatches = field.key === "creative_autonomy_club_special"
      || field.key === "creative_career_special"
      ? validateActivityContext(input.activityContext)
      : [];
    const matches: CategorizedMatch[] = lengthResult.matches.map((match) => ({
      match,
      category: "length",
    }));

    for (const match of scanPhraseRules(input.text, phraseRules, profile, field)) {
      if (suppressSpecificNameMatch(match, input, activityMatches)) continue;
      matches.push({ match, category: "content" });
    }
    const provenance = provenanceMatches(field, input.provenance);
    for (const match of provenance.matches) {
      matches.push({ match, category: "provenance" });
    }
    if (field.key === "creative_autonomy_club_special" || field.key === "creative_career_special") {
      for (const match of activityMatches) {
        matches.push({ match, category: "context" });
      }
    }
    if (field.key === "volunteer_activity") {
      for (const match of validateVolunteerContext(input.volunteerContext)) {
        matches.push({ match, category: "context" });
      }
    }

    const findings = suppressConflicts(
      deduplicateFindings(
        matches.map((match) => buildFinding(match, ruleById, evidenceService.getEvidenceSummaries)),
      ),
      ruleById,
    ).sort(compareFindings);

    const contentFindings = findings.filter((finding) => finding.category !== "provenance");
    const provenanceFindings = findings.filter((finding) => finding.category === "provenance");
    const needsContext = provenance.needsContext.map((ruleId): ContextRequirement => {
      const rule = ruleById.get(ruleId);
      if (!rule) throw new Error(`Rule pack is missing rule definition: ${ruleId}`);
      const requiredFields = ruleId === "OFFICIAL-DIRECT-OBSERVATION"
        ? ["provenance.observationBasis"]
        : ruleId === "FIELD-BEHAVIOR-CONTINUOUS-OBSERVATION"
          ? ["provenance.observationContinuity"]
          : ruleId === "OFFICIAL-FACTUAL-ACCURACY"
            ? ["provenance.factualSupport"]
            : ruleId === "OFFICIAL-STUDENT-MATERIAL-CONDITIONS"
              ? ["provenance.studentMaterial"]
              : ruleId === "OFFICIAL-STUDENT-FINAL-DRAFT"
                ? ["provenance.studentWroteFinalNarrative"]
                : ["provenance.aiUse"];
      return {
        ruleId,
        category: "provenance",
        message: rule.message,
        recommendation: rule.recommendation,
        requiredFields,
      };
    });
    const contentStatus = findingStatus(contentFindings);
    const contextStatus: ValidationResult["contextStatus"] = provenanceFindings.some((finding) => finding.outcome === "block")
      ? "blocked"
      : provenanceFindings.length > 0
        ? "review"
        : needsContext.length > 0
          ? "needs_context"
          : "complete";

    return {
      rulePackId: bundle.rules.id,
      field: field.key,
      profile,
      status: aggregateStatus(contentStatus, contextStatus),
      contentStatus,
      contextStatus,
      measurement: lengthResult.measurement,
      lengthPolicy: lengthResult.policy,
      findings,
      needsContext,
      disclaimer: DISCLAIMER,
    };
  }

  return {
    validate,
    validateBatch(entries) {
      assertBatchInput(entries, bundle.rules.fields);
      const entryResults = entries.map((entry) => ({
        entryId: entry.entryId,
        result: validate(entry),
      }));
      return {
        rulePackId: bundle.rules.id,
        status: batchStatus(entryResults.map((entry) => entry.result)),
        entries: entryResults,
      };
    },
  };
}

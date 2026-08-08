import type { SourceLocator } from "./corpus-types.ts";
import type { DataBundle } from "./data-types.ts";
import type {
  FieldKey,
  ValidationProfile,
  ValidationRule,
} from "./rule-types.ts";
import type { AuthorityLevel } from "./source-types.ts";

export interface EvidenceSummary {
  evidenceId: string;
  chunkId: string;
  sourceId: string;
  title: string;
  authority: AuthorityLevel;
  sourceSha256: string;
  locator: SourceLocator;
  locatorLabel: string;
  quote: string;
  quoteSha256: string;
}

export interface SourceExcerpt {
  chunkId: string;
  sourceId: string;
  title: string;
  authority: AuthorityLevel;
  sourceUrl?: string;
  sourceSha256: string;
  locator: SourceLocator;
  locatorLabel: string;
  headingPath: string[];
  text: string;
  textSha256: string;
}

export interface RuleExplanation {
  ruleId: string;
  title: string;
  authorityClass: "official-policy" | "editorial-caution";
  profile: ValidationProfile;
  possibleOutcomes: Array<"block" | "review">;
  appliesTo: "all" | FieldKey[];
  message: string;
  recommendation: string;
  detectorSummary: string;
  exceptions: string[];
  evidence: EvidenceSummary[];
  localPolicyId?: "LOCAL-EDITORIAL-POLICY";
  disclaimer?: "공식 규정 아님";
}

export interface EvidenceService {
  getSourceExcerpt(chunkId: string): SourceExcerpt;
  explainRule(ruleId: string): RuleExplanation;
  getEvidenceSummaries(evidenceIds: readonly string[]): EvidenceSummary[];
}

function outcomes(rule: ValidationRule): Array<"block" | "review"> {
  if ("possibleOutcomes" in rule) return [...rule.possibleOutcomes];
  return [rule.outcome];
}

function detectorSummary(rule: ValidationRule): string {
  if ("detector" in rule) {
    return rule.detector.type === "literal-any"
      ? `등록된 ${rule.detector.patterns.length}개 문구 탐지`
      : `검수된 ${rule.detector.patterns.length}개 문맥 패턴 탐지`;
  }
  if (rule.kind === "length") return `UTF-8 바이트가 ${rule.maxBytes}Byte를 초과하는지 검사`;
  if (rule.kind === "metadata") return `작성 경위 메타데이터 검사: ${rule.check}`;
  return `활동 맥락 메타데이터 검사: ${rule.check}`;
}

export function createEvidenceService(bundle: DataBundle): EvidenceService {
  function getEvidenceSummaries(evidenceIds: readonly string[]): EvidenceSummary[] {
    return evidenceIds.map((evidenceId) => {
      const evidence = bundle.evidenceById.get(evidenceId);
      if (!evidence) throw new Error(`Unknown evidence ID: ${evidenceId}`);
      const chunk = bundle.activeChunkById.get(evidence.chunkId);
      if (!chunk) throw new Error(`Evidence is outside the active chunk allowlist: ${evidenceId}`);
      const source = bundle.sourceById.get(chunk.sourceId);
      if (!source) throw new Error(`Missing source metadata for evidence: ${evidenceId}`);
      return {
        evidenceId,
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        title: source.title,
        authority: chunk.authority,
        sourceSha256: source.sha256,
        locator: chunk.locator,
        locatorLabel: chunk.locatorLabel,
        quote: evidence.quote,
        quoteSha256: evidence.quoteSha256,
      };
    });
  }

  return {
    getSourceExcerpt(chunkId) {
      const chunk = bundle.activeChunkById.get(chunkId);
      if (!chunk) throw new Error(`Unknown or inactive chunkId: ${chunkId}`);
      const source = bundle.sourceById.get(chunk.sourceId);
      if (!source) throw new Error(`Missing source metadata for chunkId: ${chunkId}`);
      return {
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        title: source.title,
        authority: chunk.authority,
        ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
        sourceSha256: source.sha256,
        locator: chunk.locator,
        locatorLabel: chunk.locatorLabel,
        headingPath: [...chunk.headingPath],
        text: chunk.text,
        textSha256: chunk.textSha256,
      };
    },

    explainRule(ruleId) {
      if (ruleId === "SOURCE-RULE-CONFLICT") {
        return {
          ruleId,
          title: "출처 규칙 충돌 확인",
          authorityClass: "official-policy",
          profile: "official",
          possibleOutcomes: ["review"],
          appliesTo: "all",
          message: "서로 충돌하도록 선언된 규칙이 같은 입력에서 탐지되었습니다.",
          recommendation: "검증 결과에 포함된 양쪽 근거를 사람이 함께 확인하세요.",
          detectorSummary: "검증 엔진의 대칭 conflictsWith 선언 검사",
          exceptions: [],
          evidence: [],
        };
      }

      const rule = bundle.rules.rules.find((candidate) => candidate.id === ruleId);
      if (!rule) throw new Error(`Unknown ruleId: ${ruleId}`);
      const isEditorial = rule.authorityClass === "editorial-caution";
      const evidenceIds = "evidenceIds" in rule && rule.evidenceIds ? rule.evidenceIds : [];
      return {
        ruleId: rule.id,
        title: rule.title,
        authorityClass: rule.authorityClass,
        profile: rule.profile,
        possibleOutcomes: outcomes(rule),
        appliesTo: rule.appliesTo,
        message: rule.message,
        recommendation: rule.recommendation,
        detectorSummary: detectorSummary(rule),
        exceptions: [...rule.exceptions],
        evidence: getEvidenceSummaries(evidenceIds),
        ...(isEditorial
          ? {
              localPolicyId: "LOCAL-EDITORIAL-POLICY" as const,
              disclaimer: "공식 규정 아님" as const,
            }
          : {}),
      };
    },

    getEvidenceSummaries,
  };
}

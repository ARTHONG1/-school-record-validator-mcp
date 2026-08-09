import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type {
  CorpusDocument,
  CorpusManifest,
  EvidenceChunk,
} from "./corpus-types.ts";
import type {
  ActiveChunkApproval,
  BundleDataPath,
  BundleManifest,
  DataBundle,
} from "./data-types.ts";
import type { RulePack, VerifiedEvidence } from "./rule-types.ts";
import type { SourceDocument } from "./source-types.ts";

const PACK_ID = "kr-moe-school-record-elementary-2026.1" as const;
const BUNDLE_MANIFEST_PATH = "data/bundle-manifest.json" as const;
const RULE_PACK_PATH = "data/rules/kr-moe-school-record-elementary-2026.1.json" as const;

const BUNDLE_DATA_PATHS = [
  "sources/manifest.json",
  "data/corpus/documents.json",
  "data/corpus/chunks.jsonl",
  "data/corpus/corpus-manifest.json",
  "data/corpus/active-chunks.json",
  "data/evidence/verified-excerpts.json",
  RULE_PACK_PATH,
] as const satisfies readonly BundleDataPath[];

const FIELD_KEYS = [
  "student_name",
  "address",
  "academic_status_special",
  "attendance_special",
  "creative_autonomy_club_special",
  "creative_career_special",
  "volunteer_activity",
  "daily_life_special",
  "subject_achievement_special",
  "behavior_opinion",
] as const;

const LENGTH_RULE_IDS = [
  "LENGTH-STUDENT-NAME",
  "LENGTH-ADDRESS",
  "LENGTH-ACADEMIC-STATUS-SPECIAL",
  "LENGTH-ATTENDANCE-SPECIAL",
  "LENGTH-VOLUNTEER-ACTIVITY",
] as const;

class DataValidationError extends Error {}

function validationFailure(kind: string, path: string): never {
  throw new DataValidationError(`Data integrity check failed: ${kind}: ${path}`);
}

function packagePath(root: string, relativePath: string): string {
  return join(root, ...relativePath.split("/"));
}

async function readDataFile(root: string, relativePath: string): Promise<Buffer> {
  try {
    return await readFile(packagePath(root, relativePath));
  } catch {
    return validationFailure("data-read", relativePath);
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function parseJson(raw: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(Buffer.from(raw).toString("utf8")) as unknown;
  } catch {
    return validationFailure("json-syntax", path);
  }
}

function parseJsonLines(raw: Uint8Array, path: string): unknown[] {
  const text = Buffer.from(raw).toString("utf8");
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0 || lines.some((line) => line.trim().length === 0)) {
    return validationFailure("json-lines", path);
  }

  try {
    return lines.map((line) => JSON.parse(line) as unknown);
  } catch {
    return validationFailure("json-syntax", path);
  }
}

function parseSchema<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
  path: string,
): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) return validationFailure("schema", path);
  return result.data;
}

const sha256Schema = z.string().regex(/^[A-F0-9]{64}$/u);
const nonBlankStringSchema = z.string().min(1).refine((value) => value.trim().length > 0);
const identifierSchema = z.string().min(1).max(200);
const schoolLevelSchema = z.enum(["elementary", "middle", "high"]);
const schoolLevelsSchema = z.array(schoolLevelSchema).min(1).superRefine((values, context) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "School levels must be unique" });
  }
});
const authoritySchema = z.union([z.literal(100), z.literal(80)]);
const sourceRoleSchema = z.enum([
  "primary-guide",
  "directive-body",
  "verification-copy",
  "directive-appendix",
]);
const sourceFormatSchema = z.enum(["pdf", "text", "hwpml", "hwp5"]);

const sourceDocumentSchema = z.object({
  id: identifierSchema,
  title: nonBlankStringSchema,
  role: sourceRoleSchema,
  format: sourceFormatSchema,
  authority: authoritySchema,
  schoolLevels: schoolLevelsSchema,
  academicYear: z.literal(2026),
  effectiveFrom: z.literal("2026-03-01"),
  publishedAt: z.string().date().optional(),
  fileName: nonBlankStringSchema,
  relativeInputPath: nonBlankStringSchema,
  snapshotName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
  sha256: sha256Schema,
  sourceUrl: z.string().url().optional(),
  minimumExtractedChars: z.number().int().positive(),
}).strict();

const sourceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  packId: z.literal(PACK_ID),
  sources: z.array(sourceDocumentSchema).length(8),
}).strict();

const bundleDataPathSchema = z.enum(BUNDLE_DATA_PATHS);
const bundleManifestSchema = z.object({
  schemaVersion: z.literal(1),
  packId: z.literal(PACK_ID),
  files: z.array(z.object({
    path: bundleDataPathSchema,
    sha256: sha256Schema,
  }).strict()).length(BUNDLE_DATA_PATHS.length),
  bundleContentSha256: sha256Schema,
}).strict();

const corpusDocumentSchema = z.object({
  sourceId: identifierSchema,
  title: nonBlankStringSchema,
  role: sourceRoleSchema,
  format: sourceFormatSchema,
  authority: authoritySchema,
  schoolLevels: schoolLevelsSchema,
  sourceSha256: sha256Schema,
  sourceUrl: z.string().url().optional(),
  snapshotName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
  unitCount: z.number().int().positive(),
  extractedCharCount: z.number().int().positive(),
  includedInChunks: z.boolean(),
}).strict();

const sourceLocatorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pdf-page"),
    pdfPage: z.number().int().positive(),
    printedPage: z.number().int().positive().optional(),
  }).strict(),
  z.object({
    kind: z.literal("article"),
    article: nonBlankStringSchema,
    paragraph: nonBlankStringSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("appendix"),
    appendix: z.union([
      z.literal(7),
      z.literal(8),
      z.literal(9),
      z.literal(10),
      z.literal(11),
    ]),
    unitIndex: z.number().int().positive(),
  }).strict(),
]);

const evidenceChunkSchema = z.object({
  id: identifierSchema,
  sourceId: identifierSchema,
  authority: authoritySchema,
  schoolLevels: schoolLevelsSchema,
  locator: sourceLocatorSchema,
  locatorLabel: nonBlankStringSchema,
  headingPath: z.array(nonBlankStringSchema),
  text: z.string(),
  searchText: z.string(),
  textSha256: sha256Schema,
}).strict();

const corpusManifestSchema = z.object({
  schemaVersion: z.literal(1),
  packId: z.literal(PACK_ID),
  sourceManifestSha256: sha256Schema,
  documentsSha256: sha256Schema,
  chunksSha256: sha256Schema,
  documentCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
}).strict();

const activeChunkApprovalSchema = z.object({
  chunkId: identifierSchema,
  scope: z.enum(["elementary", "common"]),
  reason: nonBlankStringSchema,
}).strict();

const verifiedEvidenceSchema = z.object({
  id: identifierSchema,
  chunkId: identifierSchema,
  quote: nonBlankStringSchema,
  quoteSha256: sha256Schema,
  checkedBy: z.literal("human"),
  checkedOn: z.literal("2026-07-30"),
}).strict();

const fieldKeySchema = z.enum(FIELD_KEYS);
const lengthRuleIdSchema = z.enum(LENGTH_RULE_IDS);
const evidenceIdsSchema = z.array(identifierSchema).min(1);
const lengthPolicySchema = z.union([
  z.object({
    kind: z.literal("fixed-bytes"),
    displayKoreanChars: z.number().int().positive(),
    maxBytes: z.number().int().positive(),
    scope: z.enum(["field", "entry"]),
  }).strict(),
  z.object({
    kind: z.literal("conditional-name"),
    displayKoreanChars: z.literal(20),
    displayLatinChars: z.literal(60),
    maxBytes: z.literal(60),
  }).strict(),
  z.object({ kind: z.literal("system-range") }).strict(),
]);

const fieldSpecSchema = z.object({
  key: fieldKeySchema,
  label: nonBlankStringSchema,
  lengthPolicy: lengthPolicySchema,
  applicableTo: z.enum(["all-elementary", "special-basic-curriculum"]),
  contentRuleMode: z.enum(["none", "global-prohibitions"]),
  provenanceMode: z.enum(["none", "teacher-observation", "activity-evidence"]),
  lengthRuleId: lengthRuleIdSchema.optional(),
  evidenceIds: evidenceIdsSchema,
}).strict();

const fieldsSchema = z.object({
  student_name: fieldSpecSchema,
  address: fieldSpecSchema,
  academic_status_special: fieldSpecSchema,
  attendance_special: fieldSpecSchema,
  creative_autonomy_club_special: fieldSpecSchema,
  creative_career_special: fieldSpecSchema,
  volunteer_activity: fieldSpecSchema,
  daily_life_special: fieldSpecSchema,
  subject_achievement_special: fieldSpecSchema,
  behavior_opinion: fieldSpecSchema,
}).strict();

const appliesToSchema = z.union([z.literal("all"), z.array(fieldKeySchema).min(1)]);
const conflictsWithSchema = z.array(identifierSchema).optional();
const detectorSchema = z.object({
  type: z.enum(["literal-any", "regex-any"]),
  patterns: z.array(nonBlankStringSchema).min(1),
  caseInsensitive: z.boolean().optional(),
}).strict();

const semanticTermPatternSchema = z.object({
  termId: identifierSchema,
  pattern: nonBlankStringSchema,
}).strict();

const semanticVerifierPatternSchema = z.object({
  patternId: identifierSchema,
  pattern: nonBlankStringSchema,
  termPatterns: z.array(semanticTermPatternSchema).min(1),
}).strict();

const semanticReviewSchema = z.object({
  concept: nonBlankStringSchema,
  semanticHints: z.array(nonBlankStringSchema).min(1),
  confirmPatterns: z.array(semanticVerifierPatternSchema).min(1),
  supportPatterns: z.array(z.object({
    patternId: identifierSchema,
    pattern: nonBlankStringSchema,
  }).strict()).min(1),
  negativePatterns: z.array(z.object({
    patternId: identifierSchema,
    pattern: nonBlankStringSchema,
  }).strict()).min(1),
}).strict();

const baseRuleShape = {
  id: identifierSchema,
  title: nonBlankStringSchema,
  appliesTo: appliesToSchema,
  message: nonBlankStringSchema,
  recommendation: nonBlankStringSchema,
  exceptions: z.array(nonBlankStringSchema),
  conflictsWith: conflictsWithSchema,
};

const officialPhraseRuleSchema = z.object({
  ...baseRuleShape,
  authorityClass: z.literal("official-policy"),
  profile: z.literal("official"),
  outcome: z.enum(["block", "review"]),
  evidenceIds: evidenceIdsSchema,
  detector: detectorSchema,
  semanticReview: semanticReviewSchema.optional(),
}).strict();

const editorialPhraseRuleSchema = z.object({
  ...baseRuleShape,
  authorityClass: z.literal("editorial-caution"),
  profile: z.literal("official_plus_editorial"),
  outcome: z.literal("review"),
  localPolicyId: z.literal("LOCAL-EDITORIAL-POLICY"),
  detector: detectorSchema,
  semanticReview: semanticReviewSchema.optional(),
}).strict();

const officialLengthRuleSchema = z.object({
  ...baseRuleShape,
  authorityClass: z.literal("official-policy"),
  profile: z.literal("official"),
  kind: z.literal("length"),
  field: fieldKeySchema,
  maxBytes: z.number().int().positive(),
  outcome: z.literal("block"),
  evidenceIds: evidenceIdsSchema,
}).strict();

const officialMetadataRuleSchema = z.object({
  ...baseRuleShape,
  authorityClass: z.literal("official-policy"),
  profile: z.literal("official"),
  kind: z.literal("metadata"),
  check: z.enum([
    "direct-observation",
    "factual-accuracy",
    "student-material",
    "student-final-narrative",
    "ai-use",
    "behavior-continuous-observation",
  ]),
  possibleOutcomes: z.array(z.enum(["block", "review"])).min(1),
  evidenceIds: evidenceIdsSchema,
}).strict();

const officialContextRuleSchema = z.object({
  ...baseRuleShape,
  authorityClass: z.literal("official-policy"),
  profile: z.literal("official"),
  kind: z.literal("context"),
  check: z.enum(["creative-activity-eligibility", "volunteer-eligibility"]),
  possibleOutcomes: z.array(z.enum(["block", "review"])).min(1),
  evidenceIds: evidenceIdsSchema,
}).strict();

const validationRuleSchema = z.union([
  officialPhraseRuleSchema,
  editorialPhraseRuleSchema,
  officialLengthRuleSchema,
  officialMetadataRuleSchema,
  officialContextRuleSchema,
]);

const rulePackSchema = z.object({
  id: z.literal(PACK_ID),
  schoolLevel: z.literal("elementary"),
  academicYear: z.literal(2026),
  effectiveFrom: z.literal("2026-03-01"),
  defaultProfile: z.literal("official"),
  authorityOrder: z.tuple([z.literal(100), z.literal(80), z.literal(10)]),
  fields: fieldsSchema,
  rules: z.array(validationRuleSchema).min(1),
  localPolicies: z.object({
    "LOCAL-EDITORIAL-POLICY": z.object({
      label: nonBlankStringSchema,
      disclaimer: z.literal("교육부 명시 금지가 아닌 보수적 문장 품질 검토 항목"),
    }).strict(),
  }).strict(),
}).strict();

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function verifyRawAuthoritySeparation(value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value.rules)) return;

  for (const rule of value.rules) {
    if (!isRecord(rule)) continue;
    if (rule.authorityClass === "official-policy") {
      if (
        rule.profile !== "official"
        || hasOwn(rule, "localPolicyId")
        || !hasOwn(rule, "evidenceIds")
      ) {
        validationFailure("rule-authority-separation", RULE_PACK_PATH);
      }
    } else if (rule.authorityClass === "editorial-caution") {
      if (
        rule.profile !== "official_plus_editorial"
        || rule.localPolicyId !== "LOCAL-EDITORIAL-POLICY"
        || hasOwn(rule, "evidenceIds")
      ) {
        validationFailure("rule-authority-separation", RULE_PACK_PATH);
      }
    }
  }
}

function verifySemanticMetadata(rules: RulePack): void {
  for (const rule of rules.rules) {
    if (!("detector" in rule)) continue;
    if (!rule.semanticReview) {
      validationFailure("semantic-rule-metadata", RULE_PACK_PATH);
    }
    const definition = rule.semanticReview;
    if (
      definition.confirmPatterns.some((item) => item.termPatterns.length === 0)
      || definition.semanticHints.length === 0
      || definition.supportPatterns.length === 0
      || definition.negativePatterns.length === 0
    ) {
      validationFailure("semantic-rule-metadata", RULE_PACK_PATH);
    }
  }
}

function ensureUnique(
  values: readonly unknown[],
  identity: (value: any) => string,
  path: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const id = identity(value);
    if (seen.has(id)) validationFailure("duplicate-id", path);
    seen.add(id);
  }
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .toLocaleLowerCase("ko-KR")
    .trim();
}

function verifyCorpusHashes(
  manifest: CorpusManifest,
  rawFiles: ReadonlyMap<BundleDataPath, Buffer>,
  documentCount: number,
  chunkCount: number,
): void {
  const checks: Array<[BundleDataPath, string]> = [
    ["sources/manifest.json", manifest.sourceManifestSha256],
    ["data/corpus/documents.json", manifest.documentsSha256],
    ["data/corpus/chunks.jsonl", manifest.chunksSha256],
  ];
  for (const [path, expected] of checks) {
    const bytes = rawFiles.get(path);
    if (!bytes || sha256(bytes) !== expected) validationFailure("corpus-file-hash", path);
  }
  if (manifest.documentCount !== documentCount || manifest.chunkCount !== chunkCount) {
    validationFailure("corpus-count", "data/corpus/corpus-manifest.json");
  }
}

function verifySourceReferences(
  sources: SourceDocument[],
  documents: CorpusDocument[],
  chunks: EvidenceChunk[],
): void {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const documentsBySourceId = new Map(documents.map((document) => [document.sourceId, document]));
  const chunksBySourceId = new Map<string, EvidenceChunk[]>();

  for (const source of sources) {
    if (!source.schoolLevels.includes("elementary")) {
      validationFailure("source-school-scope", "sources/manifest.json");
    }
  }

  for (const document of documents) {
    const source = sourceById.get(document.sourceId);
    if (!source) validationFailure("source-document-reference", "data/corpus/documents.json");
    if (
      document.title !== source.title
      || document.role !== source.role
      || document.format !== source.format
      || document.authority !== source.authority
      || !sameArray(document.schoolLevels, source.schoolLevels)
      || document.sourceSha256 !== source.sha256
      || document.sourceUrl !== source.sourceUrl
      || document.snapshotName !== source.snapshotName
    ) {
      validationFailure("source-document-metadata", "data/corpus/documents.json");
    }
  }

  if (documentsBySourceId.size !== sourceById.size) {
    validationFailure("source-document-reference", "data/corpus/documents.json");
  }
  for (const sourceId of sourceById.keys()) {
    if (!documentsBySourceId.has(sourceId)) {
      validationFailure("source-document-reference", "data/corpus/documents.json");
    }
  }

  for (const chunk of chunks) {
    const source = sourceById.get(chunk.sourceId);
    if (!source) validationFailure("source-chunk-reference", "data/corpus/chunks.jsonl");
    if (
      chunk.authority !== source.authority
      || !sameArray(chunk.schoolLevels, source.schoolLevels)
    ) {
      validationFailure("source-chunk-metadata", "data/corpus/chunks.jsonl");
    }
    if (sha256(chunk.text) !== chunk.textSha256) {
      validationFailure("chunk-text-hash", "data/corpus/chunks.jsonl");
    }
    if (normalizeSearchText(chunk.text) !== chunk.searchText) {
      validationFailure("chunk-search-text", "data/corpus/chunks.jsonl");
    }
    const sourceChunks = chunksBySourceId.get(chunk.sourceId) ?? [];
    sourceChunks.push(chunk);
    chunksBySourceId.set(chunk.sourceId, sourceChunks);
  }

  for (const document of documents) {
    const hasChunks = (chunksBySourceId.get(document.sourceId)?.length ?? 0) > 0;
    if (document.includedInChunks !== hasChunks) {
      validationFailure("document-chunk-inclusion", "data/corpus/documents.json");
    }
    if (document.role === "verification-copy" ? hasChunks : !hasChunks) {
      validationFailure("document-chunk-inclusion", "data/corpus/documents.json");
    }
  }
}

function verifyActiveChunks(
  approvals: ActiveChunkApproval[],
  chunks: EvidenceChunk[],
): Map<string, EvidenceChunk> {
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const activeChunkById = new Map<string, EvidenceChunk>();
  for (const approval of approvals) {
    const chunk = chunkById.get(approval.chunkId);
    if (!chunk) validationFailure("active-chunk-reference", "data/corpus/active-chunks.json");
    if (chunk.text.trim().length === 0 || chunk.searchText.trim().length === 0) {
      validationFailure("active-chunk-empty", "data/corpus/active-chunks.json");
    }
    const validScope = approval.scope === "elementary"
      ? sameSet(chunk.schoolLevels, ["elementary"])
      : sameSet(chunk.schoolLevels, ["elementary", "middle", "high"]);
    if (!validScope) validationFailure("active-chunk-scope", "data/corpus/active-chunks.json");
    activeChunkById.set(chunk.id, chunk);
  }
  return activeChunkById;
}

function verifyEvidence(
  evidence: VerifiedEvidence[],
  activeChunkById: ReadonlyMap<string, EvidenceChunk>,
): void {
  for (const excerpt of evidence) {
    const chunk = activeChunkById.get(excerpt.chunkId);
    if (!chunk) {
      validationFailure("evidence-active-reference", "data/evidence/verified-excerpts.json");
    }
    if (sha256(excerpt.quote) !== excerpt.quoteSha256) {
      validationFailure("evidence-quote-hash", "data/evidence/verified-excerpts.json");
    }
    const normalizedQuote = normalizeSearchText(excerpt.quote);
    if (
      normalizedQuote.length === 0
      || !normalizeSearchText(chunk.text).includes(normalizedQuote)
    ) {
      validationFailure("evidence-quote-containment", "data/evidence/verified-excerpts.json");
    }
  }
}

function hasUnsafeBackreference(pattern: string): boolean {
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== "\\") continue;
    let end = index;
    while (pattern[end] === "\\") end += 1;
    const slashCount = end - index;
    if (slashCount % 2 === 1) {
      const next = pattern[end];
      if (next !== undefined && /^[1-9]$/u.test(next)) return true;
      if (next === "k" && pattern[end + 1] === "<") return true;
    }
    index = end - 1;
  }
  return false;
}

function verifyRegexRules(rules: RulePack): void {
  for (const rule of rules.rules) {
    if (!("detector" in rule) || rule.detector.type !== "regex-any") continue;
    for (const pattern of rule.detector.patterns) {
      if (
        hasUnsafeBackreference(pattern)
        || pattern.includes("(?<=")
        || pattern.includes("(?<!")
      ) {
        validationFailure("unsafe-regex", RULE_PACK_PATH);
      }
      let expression: RegExp;
      try {
        expression = new RegExp(pattern, "giu");
      } catch {
        validationFailure("unsafe-regex", RULE_PACK_PATH);
      }
      for (const sample of ["", "a", "금지 문구"]) {
        expression.lastIndex = 0;
        const match = expression.exec(sample);
        if (match?.[0].length === 0) validationFailure("unsafe-regex", RULE_PACK_PATH);
      }
    }
  }
}

function verifyRuleReferences(rules: RulePack, evidence: VerifiedEvidence[]): void {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const ruleById = new Map(rules.rules.map((rule) => [rule.id, rule]));

  for (const [key, field] of Object.entries(rules.fields)) {
    if (field.key !== key) validationFailure("rule-field-reference", RULE_PACK_PATH);
    if (new Set(field.evidenceIds).size !== field.evidenceIds.length) {
      validationFailure("duplicate-id", RULE_PACK_PATH);
    }
    if (field.evidenceIds.some((id) => !evidenceById.has(id))) {
      validationFailure("rule-evidence-reference", RULE_PACK_PATH);
    }
  }

  for (const rule of rules.rules) {
    if (rule.appliesTo !== "all" && new Set(rule.appliesTo).size !== rule.appliesTo.length) {
      validationFailure("duplicate-id", RULE_PACK_PATH);
    }
    if (rule.conflictsWith && new Set(rule.conflictsWith).size !== rule.conflictsWith.length) {
      validationFailure("duplicate-id", RULE_PACK_PATH);
    }
    if ("possibleOutcomes" in rule && new Set(rule.possibleOutcomes).size !== rule.possibleOutcomes.length) {
      validationFailure("duplicate-id", RULE_PACK_PATH);
    }
    if (
      rule.authorityClass === "official-policy"
      && rule.evidenceIds.some((id) => !evidenceById.has(id))
    ) {
      validationFailure("rule-evidence-reference", RULE_PACK_PATH);
    }
  }

  for (const rule of rules.rules) {
    for (const conflictId of rule.conflictsWith ?? []) {
      const conflict = ruleById.get(conflictId);
      if (!conflict || conflict.id === rule.id) {
        validationFailure("rule-conflict-reference", RULE_PACK_PATH);
      }
      if (!conflict.conflictsWith?.includes(rule.id)) {
        validationFailure("rule-conflict-symmetry", RULE_PACK_PATH);
      }
    }
  }
}

function verifyLengthRules(rules: RulePack): void {
  const lengthRules = rules.rules.filter((rule) => "kind" in rule && rule.kind === "length");

  for (const field of Object.values(rules.fields)) {
    const rulesForField = lengthRules.filter((rule) => rule.field === field.key);
    if (field.lengthPolicy.kind === "system-range") {
      if (field.lengthRuleId !== undefined || rulesForField.length !== 0) {
        validationFailure("length-rule-field", RULE_PACK_PATH);
      }
      continue;
    }

    if (field.lengthRuleId === undefined || rulesForField.length !== 1) {
      validationFailure("length-rule-field", RULE_PACK_PATH);
    }
    const lengthRule = rulesForField[0];
    if (
      lengthRule.id !== field.lengthRuleId
      || lengthRule.field !== field.key
      || lengthRule.maxBytes !== field.lengthPolicy.maxBytes
      || !sameArray(lengthRule.evidenceIds, field.evidenceIds)
      || lengthRule.appliesTo === "all"
      || !sameArray(lengthRule.appliesTo, [field.key])
    ) {
      validationFailure("length-rule-field", RULE_PACK_PATH);
    }
  }

  for (const lengthRule of lengthRules) {
    const field = rules.fields[lengthRule.field];
    if (field.lengthPolicy.kind === "system-range" || field.lengthRuleId !== lengthRule.id) {
      validationFailure("length-rule-field", RULE_PACK_PATH);
    }
  }
}

async function verifyBundleManifest(
  packageRoot: string,
): Promise<{
  manifest: BundleManifest;
  manifestSha256: string;
  rawFiles: Map<BundleDataPath, Buffer>;
}> {
  const manifestBytes = await readDataFile(packageRoot, BUNDLE_MANIFEST_PATH);
  const manifest = parseSchema(
    bundleManifestSchema,
    parseJson(manifestBytes, BUNDLE_MANIFEST_PATH),
    BUNDLE_MANIFEST_PATH,
  ) as BundleManifest;
  ensureUnique(manifest.files, (file) => file.path, BUNDLE_MANIFEST_PATH);

  const fileByPath = new Map(manifest.files.map((file) => [file.path, file]));
  if (
    fileByPath.size !== BUNDLE_DATA_PATHS.length
    || BUNDLE_DATA_PATHS.some((path) => !fileByPath.has(path))
  ) {
    validationFailure("bundle-file-set", BUNDLE_MANIFEST_PATH);
  }

  const rawFiles = new Map<BundleDataPath, Buffer>();
  for (const path of BUNDLE_DATA_PATHS) {
    const bytes = await readDataFile(packageRoot, path);
    rawFiles.set(path, bytes);
    if (sha256(bytes) !== fileByPath.get(path)?.sha256) {
      validationFailure("bundle-file-hash", path);
    }
  }

  const content = [...BUNDLE_DATA_PATHS]
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((path) => `${path}\0${sha256(rawFiles.get(path) as Buffer)}\n`)
    .join("");
  if (sha256(content) !== manifest.bundleContentSha256) {
    validationFailure("bundle-content-hash", BUNDLE_MANIFEST_PATH);
  }

  return {
    manifest,
    manifestSha256: sha256(manifestBytes),
    rawFiles,
  };
}

export function defaultPackageRoot(): string {
  return fileURLToPath(new URL("../", import.meta.url));
}

export async function loadDataBundle(packageRoot = defaultPackageRoot()): Promise<DataBundle> {
  const root = resolve(packageRoot);
  const { manifest, manifestSha256, rawFiles } = await verifyBundleManifest(root);

  const sourceManifestPath = "sources/manifest.json" as const;
  const documentsPath = "data/corpus/documents.json" as const;
  const chunksPath = "data/corpus/chunks.jsonl" as const;
  const corpusManifestPath = "data/corpus/corpus-manifest.json" as const;
  const activeChunksPath = "data/corpus/active-chunks.json" as const;
  const evidencePath = "data/evidence/verified-excerpts.json" as const;

  const sourceManifest = parseSchema(
    sourceManifestSchema,
    parseJson(rawFiles.get(sourceManifestPath) as Buffer, sourceManifestPath),
    sourceManifestPath,
  );
  const documents = parseSchema(
    z.array(corpusDocumentSchema),
    parseJson(rawFiles.get(documentsPath) as Buffer, documentsPath),
    documentsPath,
  ) as CorpusDocument[];
  const chunks = parseSchema(
    z.array(evidenceChunkSchema),
    parseJsonLines(rawFiles.get(chunksPath) as Buffer, chunksPath),
    chunksPath,
  ) as EvidenceChunk[];
  const corpusManifest = parseSchema(
    corpusManifestSchema,
    parseJson(rawFiles.get(corpusManifestPath) as Buffer, corpusManifestPath),
    corpusManifestPath,
  ) as CorpusManifest;
  const activeChunkApprovals = parseSchema(
    z.array(activeChunkApprovalSchema),
    parseJson(rawFiles.get(activeChunksPath) as Buffer, activeChunksPath),
    activeChunksPath,
  ) as ActiveChunkApproval[];
  const evidence = parseSchema(
    z.array(verifiedEvidenceSchema),
    parseJson(rawFiles.get(evidencePath) as Buffer, evidencePath),
    evidencePath,
  ) as VerifiedEvidence[];

  const rawRules = parseJson(rawFiles.get(RULE_PACK_PATH) as Buffer, RULE_PACK_PATH);
  verifyRawAuthoritySeparation(rawRules);
  const rules = parseSchema(rulePackSchema, rawRules, RULE_PACK_PATH) as RulePack;
  const sources = sourceManifest.sources as SourceDocument[];

  ensureUnique(sources, (source) => source.id, sourceManifestPath);
  ensureUnique(sources, (source) => source.snapshotName, sourceManifestPath);
  ensureUnique(documents, (document) => document.sourceId, documentsPath);
  ensureUnique(chunks, (chunk) => chunk.id, chunksPath);
  ensureUnique(activeChunkApprovals, (approval) => approval.chunkId, activeChunksPath);
  ensureUnique(evidence, (item) => item.id, evidencePath);
  ensureUnique(rules.rules, (rule) => rule.id, RULE_PACK_PATH);

  verifyCorpusHashes(corpusManifest, rawFiles, documents.length, chunks.length);
  verifySourceReferences(sources, documents, chunks);
  const activeChunkById = verifyActiveChunks(activeChunkApprovals, chunks);
  verifyEvidence(evidence, activeChunkById);
  verifyRuleReferences(rules, evidence);
  verifyLengthRules(rules);
  verifyRegexRules(rules);

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const documentBySourceId = new Map(documents.map((document) => [document.sourceId, document]));
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const activeChunkApprovalById = new Map(
    activeChunkApprovals.map((approval) => [approval.chunkId, approval]),
  );
  const activeChunks = activeChunkApprovals.map((approval) => activeChunkById.get(approval.chunkId) as EvidenceChunk);
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));

  return {
    bundleManifest: manifest,
    bundleManifestSha256: manifestSha256,
    bundleContentSha256: manifest.bundleContentSha256,
    corpusManifest,
    sources,
    sourceById,
    documents,
    documentBySourceId,
    chunks,
    chunkById,
    activeChunkApprovals,
    activeChunkApprovalById,
    activeChunks,
    activeChunkById,
    evidence,
    evidenceById,
    rules,
  };
}

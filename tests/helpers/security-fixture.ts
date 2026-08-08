import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const RULE_PACK_PATH = "data/rules/kr-moe-school-record-elementary-2026.1.json";
export const EVIDENCE_PATH = "data/evidence/verified-excerpts.json";
export const CHUNKS_PATH = "data/corpus/chunks.jsonl";
export const BUNDLE_MANIFEST_PATH = "data/bundle-manifest.json";

export const BUNDLE_DATA_PATHS = [
  "sources/manifest.json",
  "data/corpus/documents.json",
  CHUNKS_PATH,
  "data/corpus/corpus-manifest.json",
  "data/corpus/active-chunks.json",
  EVIDENCE_PATH,
  RULE_PACK_PATH,
] as const;

export type SecurityBundlePath = (typeof BUNDLE_DATA_PATHS)[number];
type JsonRecord = Record<string, any>;

const PACK_ID = "kr-moe-school-record-elementary-2026.1";
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

export function fixturePath(root: string, relativePath: string): string {
  return join(root, ...relativePath.split("/"));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeText(root: string, relativePath: string, value: string): Promise<void> {
  const target = fixturePath(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}

export async function readFixtureJson<T = JsonRecord>(
  root: string,
  relativePath: string,
): Promise<T> {
  return JSON.parse(await readFile(fixturePath(root, relativePath), "utf8")) as T;
}

export async function mutateFixtureJson(
  root: string,
  relativePath: string,
  mutate: (value: any) => void,
): Promise<void> {
  const value = await readFixtureJson(root, relativePath);
  mutate(value);
  await writeText(root, relativePath, json(value));
}

export async function mutateFixtureJsonLines(
  root: string,
  relativePath: string,
  mutate: (value: any[]) => void,
): Promise<void> {
  const input = await readFile(fixturePath(root, relativePath), "utf8");
  const value = input.trimEnd().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  mutate(value);
  await writeText(root, relativePath, `${value.map((item) => JSON.stringify(item)).join("\n")}\n`);
}

function source(
  index: number,
  role: "primary-guide" | "directive-body" | "verification-copy" | "directive-appendix",
  format: "pdf" | "text" | "hwpml" | "hwp5",
  authority: 80 | 100,
  schoolLevels: string[],
): JsonRecord {
  const id = role === "directive-appendix" ? `SRC-APPENDIX-${index + 4}` : `SRC-${index + 1}`;
  return {
    id,
    title: `Security fixture source ${index + 1}`,
    role,
    format,
    authority,
    schoolLevels,
    academicYear: 2026,
    effectiveFrom: "2026-03-01",
    publishedAt: "2026-02-12",
    fileName: `source-${index + 1}.${format === "pdf" ? "pdf" : "txt"}`,
    relativeInputPath: `fixture/source-${index + 1}.${format === "pdf" ? "pdf" : "txt"}`,
    snapshotName: `source-${index + 1}.${format}`,
    sha256: String((index + 1) % 10).repeat(64),
    minimumExtractedChars: 1,
  };
}

function buildSources(): JsonRecord[] {
  return [
    source(0, "primary-guide", "pdf", 80, ["elementary"]),
    source(1, "directive-body", "text", 100, ["elementary", "middle", "high"]),
    source(2, "verification-copy", "hwpml", 100, ["elementary", "middle", "high"]),
    source(3, "directive-appendix", "hwp5", 100, ["elementary", "middle", "high"]),
    source(4, "directive-appendix", "hwp5", 100, ["elementary", "middle", "high"]),
    source(5, "directive-appendix", "hwp5", 100, ["elementary", "middle", "high"]),
    source(6, "directive-appendix", "hwp5", 100, ["elementary", "middle", "high"]),
    source(7, "directive-appendix", "hwp5", 100, ["elementary", "middle", "high"]),
  ];
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

function buildDocuments(sources: JsonRecord[]): JsonRecord[] {
  return sources.map((item) => ({
    sourceId: item.id,
    title: item.title,
    role: item.role,
    format: item.format,
    authority: item.authority,
    schoolLevels: [...item.schoolLevels],
    sourceSha256: item.sha256,
    snapshotName: item.snapshotName,
    unitCount: 1,
    extractedCharCount: 100,
    includedInChunks: item.role !== "verification-copy",
  }));
}

function buildChunks(sources: JsonRecord[]): JsonRecord[] {
  return sources
    .filter((item) => item.role !== "verification-copy")
    .map((item, index) => {
      const text = index === 0
        ? "앞 문장\n공식 인용문\n뒷 문장"
        : `Security fixture corpus text ${index + 1}`;
      const locator = item.role === "primary-guide"
        ? { kind: "pdf-page", pdfPage: 24, printedPage: 18 }
        : item.role === "directive-body"
          ? { kind: "article", article: "4", paragraph: "2" }
          : {
              kind: "appendix",
              appendix: Number(item.id.match(/(\d+)$/u)?.[1]),
              unitIndex: 1,
            };
      return {
        id: `${item.id}:chunk-001`,
        sourceId: item.id,
        authority: item.authority,
        schoolLevels: [...item.schoolLevels],
        locator,
        locatorLabel: `Security fixture locator ${index + 1}`,
        headingPath: [`Security fixture heading ${index + 1}`],
        text,
        searchText: normalizeSearchText(text),
        textSha256: sha256(text),
      };
    });
}

function field(
  key: (typeof FIELD_KEYS)[number],
  lengthPolicy: JsonRecord,
  lengthRuleId?: string,
): JsonRecord {
  return {
    key,
    label: `Security fixture field ${key}`,
    lengthPolicy,
    applicableTo: key === "daily_life_special" ? "special-basic-curriculum" : "all-elementary",
    contentRuleMode: key === "student_name" || key === "address" ? "none" : "global-prohibitions",
    provenanceMode: key === "student_name"
      || key === "address"
      || key === "academic_status_special"
      || key === "attendance_special"
      ? "none"
      : key === "volunteer_activity"
        ? "activity-evidence"
        : "teacher-observation",
    ...(lengthRuleId ? { lengthRuleId } : {}),
    evidenceIds: ["EV-SECURITY-FIXTURE"],
  };
}

function lengthRule(id: string, fieldKey: string, maxBytes: number): JsonRecord {
  return {
    id,
    title: `Security fixture length ${fieldKey}`,
    authorityClass: "official-policy",
    profile: "official",
    appliesTo: [fieldKey],
    message: "Security fixture official message",
    recommendation: "Security fixture official recommendation",
    exceptions: [],
    kind: "length",
    field: fieldKey,
    maxBytes,
    outcome: "block",
    evidenceIds: ["EV-SECURITY-FIXTURE"],
  };
}

function buildRulePack(): JsonRecord {
  const fields = {
    student_name: field(
      "student_name",
      { kind: "conditional-name", displayKoreanChars: 20, displayLatinChars: 60, maxBytes: 60 },
      "LENGTH-STUDENT-NAME",
    ),
    address: field(
      "address",
      { kind: "fixed-bytes", displayKoreanChars: 300, maxBytes: 900, scope: "field" },
      "LENGTH-ADDRESS",
    ),
    academic_status_special: field(
      "academic_status_special",
      { kind: "fixed-bytes", displayKoreanChars: 500, maxBytes: 1500, scope: "field" },
      "LENGTH-ACADEMIC-STATUS-SPECIAL",
    ),
    attendance_special: field(
      "attendance_special",
      { kind: "fixed-bytes", displayKoreanChars: 500, maxBytes: 1500, scope: "field" },
      "LENGTH-ATTENDANCE-SPECIAL",
    ),
    creative_autonomy_club_special: field("creative_autonomy_club_special", { kind: "system-range" }),
    creative_career_special: field("creative_career_special", { kind: "system-range" }),
    volunteer_activity: field(
      "volunteer_activity",
      { kind: "fixed-bytes", displayKoreanChars: 50, maxBytes: 150, scope: "entry" },
      "LENGTH-VOLUNTEER-ACTIVITY",
    ),
    daily_life_special: field("daily_life_special", { kind: "system-range" }),
    subject_achievement_special: field("subject_achievement_special", { kind: "system-range" }),
    behavior_opinion: field("behavior_opinion", { kind: "system-range" }),
  };

  return {
    id: PACK_ID,
    schoolLevel: "elementary",
    academicYear: 2026,
    effectiveFrom: "2026-03-01",
    defaultProfile: "official",
    authorityOrder: [100, 80, 10],
    fields,
    rules: [
      lengthRule("LENGTH-STUDENT-NAME", "student_name", 60),
      lengthRule("LENGTH-ADDRESS", "address", 900),
      lengthRule("LENGTH-ACADEMIC-STATUS-SPECIAL", "academic_status_special", 1500),
      lengthRule("LENGTH-ATTENDANCE-SPECIAL", "attendance_special", 1500),
      lengthRule("LENGTH-VOLUNTEER-ACTIVITY", "volunteer_activity", 150),
      {
        id: "OFFICIAL-SECURITY-FIXTURE-REGEX",
        title: "Security fixture official phrase rule",
        authorityClass: "official-policy",
        profile: "official",
        appliesTo: ["behavior_opinion"],
        message: "Security fixture official phrase message",
        recommendation: "Security fixture official phrase recommendation",
        exceptions: [],
        outcome: "review",
        evidenceIds: ["EV-SECURITY-FIXTURE"],
        detector: { type: "regex-any", patterns: ["금지[^.!?\\n]{0,10}문구"] },
      },
      {
        id: "EDITORIAL-SECURITY-FIXTURE",
        title: "Security fixture editorial rule",
        authorityClass: "editorial-caution",
        profile: "official_plus_editorial",
        appliesTo: ["behavior_opinion"],
        message: "Security fixture editorial message",
        recommendation: "Security fixture editorial recommendation",
        exceptions: [],
        outcome: "review",
        localPolicyId: "LOCAL-EDITORIAL-POLICY",
        detector: { type: "literal-any", patterns: ["항상"] },
      },
    ],
    localPolicies: {
      "LOCAL-EDITORIAL-POLICY": {
        label: "자체 편집 경고",
        disclaimer: "교육부 명시 금지가 아닌 보수적 문장 품질 검토 항목",
      },
    },
  };
}

export async function refreshFixtureCorpusManifest(root: string): Promise<void> {
  const sourceBytes = await readFile(fixturePath(root, "sources/manifest.json"));
  const documentBytes = await readFile(fixturePath(root, "data/corpus/documents.json"));
  const chunkBytes = await readFile(fixturePath(root, CHUNKS_PATH));
  const documents = JSON.parse(documentBytes.toString("utf8")) as unknown[];
  const chunks = chunkBytes.toString("utf8").trimEnd().split("\n").filter(Boolean);
  await writeText(root, "data/corpus/corpus-manifest.json", json({
    schemaVersion: 1,
    packId: PACK_ID,
    sourceManifestSha256: sha256(sourceBytes),
    documentsSha256: sha256(documentBytes),
    chunksSha256: sha256(chunkBytes),
    documentCount: documents.length,
    chunkCount: chunks.length,
  }));
}

export async function sealFixtureBundle(root: string): Promise<void> {
  const files = [];
  for (const path of [...BUNDLE_DATA_PATHS].sort((left, right) => left.localeCompare(right, "en"))) {
    files.push({ path, sha256: sha256(await readFile(fixturePath(root, path))) });
  }
  const content = files.map((file) => `${file.path}\0${file.sha256}\n`).join("");
  await writeText(root, BUNDLE_MANIFEST_PATH, json({
    schemaVersion: 1,
    packId: PACK_ID,
    files,
    bundleContentSha256: sha256(content),
  }));
}

export async function createSealedSecurityFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "record-security-"));
  const sources = buildSources();
  const documents = buildDocuments(sources);
  const chunks = buildChunks(sources);
  const activeChunks = chunks.map((chunk) => ({
    chunkId: chunk.id,
    scope: chunk.schoolLevels.length === 1 ? "elementary" : "common",
    reason: "Security fixture approval",
  }));
  const evidence = [{
    id: "EV-SECURITY-FIXTURE",
    chunkId: chunks[0].id,
    quote: "공식 인용문",
    quoteSha256: sha256("공식 인용문"),
    checkedBy: "human",
    checkedOn: "2026-07-30",
  }];

  await writeText(root, "sources/manifest.json", json({ schemaVersion: 1, packId: PACK_ID, sources }));
  await writeText(root, "data/corpus/documents.json", json(documents));
  await writeText(root, CHUNKS_PATH, `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`);
  await writeText(root, "data/corpus/active-chunks.json", json(activeChunks));
  await writeText(root, EVIDENCE_PATH, json(evidence));
  await writeText(root, RULE_PACK_PATH, json(buildRulePack()));
  await refreshFixtureCorpusManifest(root);
  await sealFixtureBundle(root);
  return root;
}

export async function hasRuntimeLoaderDependency(): Promise<boolean> {
  try {
    await import("zod");
    return true;
  } catch (error: unknown) {
    if (
      error !== null
      && typeof error === "object"
      && "code" in error
      && error.code === "ERR_MODULE_NOT_FOUND"
    ) {
      return false;
    }
    throw error;
  }
}

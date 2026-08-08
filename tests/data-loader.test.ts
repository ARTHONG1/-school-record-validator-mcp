import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { loadDataBundle } from "../src/data-loader.ts";

const PACK_ID = "kr-moe-school-record-elementary-2026.1";
const BUNDLE_PATHS = [
  "sources/manifest.json",
  "data/corpus/documents.json",
  "data/corpus/chunks.jsonl",
  "data/corpus/corpus-manifest.json",
  "data/corpus/active-chunks.json",
  "data/evidence/verified-excerpts.json",
  "data/rules/kr-moe-school-record-elementary-2026.1.json",
] as const;

type BundlePath = (typeof BUNDLE_PATHS)[number];
type JsonObject = Record<string, any>;

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

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function packagePath(root: string, relativePath: string): string {
  return join(root, ...relativePath.split("/"));
}

async function writeText(root: string, relativePath: string, value: string): Promise<void> {
  const target = packagePath(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}

async function readJson<T = JsonObject>(root: string, relativePath: string): Promise<T> {
  return JSON.parse(await readFile(packagePath(root, relativePath), "utf8")) as T;
}

async function updateJson(
  root: string,
  relativePath: string,
  mutate: (value: any) => void,
): Promise<void> {
  const value = await readJson(root, relativePath);
  mutate(value);
  await writeText(root, relativePath, json(value));
}

async function updateJsonLines(
  root: string,
  relativePath: string,
  mutate: (value: any[]) => void,
): Promise<void> {
  const input = await readFile(packagePath(root, relativePath), "utf8");
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
): JsonObject {
  const id = role === "directive-appendix" ? `SRC-APPENDIX-${index + 4}` : `SRC-${index + 1}`;
  return {
    id,
    title: `Fixture source ${index + 1}`,
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

function buildSources(): JsonObject[] {
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

function buildDocuments(sources: JsonObject[]): JsonObject[] {
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

function buildChunks(sources: JsonObject[]): JsonObject[] {
  return sources
    .filter((item) => item.role !== "verification-copy")
    .map((item, index) => {
      const text = index === 0
        ? "앞 문장\n공식   인용문\n뒷 문장"
        : `Fixture corpus text ${index + 1}`;
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
        locatorLabel: `Fixture locator ${index + 1}`,
        headingPath: [`Fixture heading ${index + 1}`],
        text,
        searchText: normalizeSearchText(text),
        textSha256: sha256(text),
      };
    });
}

function field(
  key: (typeof FIELD_KEYS)[number],
  lengthPolicy: JsonObject,
  lengthRuleId?: string,
): JsonObject {
  return {
    key,
    label: `Fixture field ${key}`,
    lengthPolicy,
    applicableTo: key === "daily_life_special" ? "special-basic-curriculum" : "all-elementary",
    contentRuleMode: key === "student_name" || key === "address" ? "none" : "global-prohibitions",
    provenanceMode: key === "student_name" || key === "address" || key === "academic_status_special" || key === "attendance_special"
      ? "none"
      : key === "volunteer_activity"
        ? "activity-evidence"
        : "teacher-observation",
    ...(lengthRuleId ? { lengthRuleId } : {}),
    evidenceIds: ["EV-FIXTURE"],
  };
}

function lengthRule(id: string, fieldKey: string, maxBytes: number): JsonObject {
  return {
    id,
    title: `Fixture length ${fieldKey}`,
    authorityClass: "official-policy",
    profile: "official",
    appliesTo: [fieldKey],
    message: "Fixture official message",
    recommendation: "Fixture official recommendation",
    exceptions: [],
    kind: "length",
    field: fieldKey,
    maxBytes,
    outcome: "block",
    evidenceIds: ["EV-FIXTURE"],
  };
}

function buildRulePack(): JsonObject {
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
        id: "OFFICIAL-FIXTURE-REGEX",
        title: "Fixture official phrase rule",
        authorityClass: "official-policy",
        profile: "official",
        appliesTo: ["behavior_opinion"],
        message: "Fixture official phrase message",
        recommendation: "Fixture official phrase recommendation",
        exceptions: [],
        outcome: "review",
        evidenceIds: ["EV-FIXTURE"],
        detector: { type: "regex-any", patterns: ["금지[^.!?\\n]{0,10}문구"] },
      },
      {
        id: "EDITORIAL-FIXTURE",
        title: "Fixture editorial rule",
        authorityClass: "editorial-caution",
        profile: "official_plus_editorial",
        appliesTo: ["behavior_opinion"],
        message: "Fixture editorial message",
        recommendation: "Fixture editorial recommendation",
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

async function refreshCorpusManifest(root: string): Promise<void> {
  const sourceBytes = await readFile(packagePath(root, "sources/manifest.json"));
  const documentBytes = await readFile(packagePath(root, "data/corpus/documents.json"));
  const chunkBytes = await readFile(packagePath(root, "data/corpus/chunks.jsonl"));
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

async function seal(root: string): Promise<void> {
  const files = [];
  for (const path of [...BUNDLE_PATHS].sort((left, right) => left.localeCompare(right, "en"))) {
    files.push({ path, sha256: sha256(await readFile(packagePath(root, path))) });
  }
  const content = files.map((file) => `${file.path}\0${file.sha256}\n`).join("");
  await writeText(root, "data/bundle-manifest.json", json({
    schemaVersion: 1,
    packId: PACK_ID,
    files,
    bundleContentSha256: sha256(content),
  }));
}

async function createPackageRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "record-data-loader-"));
  const sources = buildSources();
  const documents = buildDocuments(sources);
  const chunks = buildChunks(sources);
  const active = chunks.map((chunk) => ({
    chunkId: chunk.id,
    scope: chunk.schoolLevels.length === 1 ? "elementary" : "common",
    reason: "Fixture is approved for loader testing",
  }));
  const evidence = [{
    id: "EV-FIXTURE",
    chunkId: chunks[0].id,
    quote: "공식 인용문",
    quoteSha256: sha256("공식 인용문"),
    checkedBy: "human",
    checkedOn: "2026-07-30",
  }];

  await writeText(root, "sources/manifest.json", json({ schemaVersion: 1, packId: PACK_ID, sources }));
  await writeText(root, "data/corpus/documents.json", json(documents));
  await writeText(root, "data/corpus/chunks.jsonl", `${chunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`);
  await writeText(root, "data/corpus/active-chunks.json", json(active));
  await writeText(root, "data/evidence/verified-excerpts.json", json(evidence));
  await writeText(root, "data/rules/kr-moe-school-record-elementary-2026.1.json", json(buildRulePack()));
  await refreshCorpusManifest(root);
  await seal(root);
  return root;
}

async function mutateAndReseal(
  root: string,
  path: Exclude<BundlePath, "data/corpus/chunks.jsonl">,
  mutate: (value: any) => void,
  refreshCorpus = false,
): Promise<void> {
  await updateJson(root, path, mutate);
  if (refreshCorpus) await refreshCorpusManifest(root);
  await seal(root);
}

async function mutateLinesAndReseal(
  root: string,
  mutate: (value: any[]) => void,
): Promise<void> {
  await updateJsonLines(root, "data/corpus/chunks.jsonl", mutate);
  await refreshCorpusManifest(root);
  await seal(root);
}

async function expectLoadFailure(root: string, kind: RegExp, secret?: string): Promise<void> {
  await assert.rejects(
    loadDataBundle(root),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, kind);
      assert.match(error.message, /(?:sources|data)\//u);
      if (secret) assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
}

describe("runtime data bundle loader", () => {
  it("loads a fully sealed package root and builds every lookup map", async () => {
    const root = await createPackageRoot();

    const bundle = await loadDataBundle(root);

    assert.equal(bundle.sources.length, 8);
    assert.equal(bundle.documents.length, 8);
    assert.equal(bundle.chunks.length, 7);
    assert.equal(bundle.activeChunks.length, 7);
    assert.equal(bundle.evidence.length, 1);
    assert.equal(bundle.rules.rules.length, 7);
    assert.equal(bundle.sourceById.get("SRC-1")?.title, "Fixture source 1");
    assert.equal(bundle.documentBySourceId.get("SRC-1")?.sourceSha256, "1".repeat(64));
    assert.equal(bundle.chunkById.get("SRC-1:chunk-001")?.sourceId, "SRC-1");
    assert.equal(bundle.activeChunkById.has("SRC-1:chunk-001"), true);
    assert.equal(bundle.evidenceById.get("EV-FIXTURE")?.quote, "공식 인용문");
    assert.equal(bundle.bundleContentSha256, bundle.bundleManifest.bundleContentSha256);
    assert.match(bundle.bundleManifestSha256, /^[A-F0-9]{64}$/u);
  });

  it("rejects a changed sealed file and an incorrect aggregate content hash", async () => {
    const changedFileRoot = await createPackageRoot();
    await writeFile(packagePath(changedFileRoot, "data/corpus/documents.json"), "[]\n", "utf8");
    await expectLoadFailure(changedFileRoot, /bundle-file-hash.*data\/corpus\/documents\.json/u);

    const contentHashRoot = await createPackageRoot();
    await updateJson(contentHashRoot, "data/bundle-manifest.json", (manifest) => {
      manifest.bundleContentSha256 = "F".repeat(64);
    });
    await expectLoadFailure(contentHashRoot, /bundle-content-hash.*data\/bundle-manifest\.json/u);
  });

  it("checks corpus file hashes and declared document and chunk counts", async () => {
    const hashRoot = await createPackageRoot();
    await updateJson(hashRoot, "data/corpus/corpus-manifest.json", (manifest) => {
      manifest.documentsSha256 = "A".repeat(64);
    });
    await seal(hashRoot);
    await expectLoadFailure(hashRoot, /corpus-file-hash.*data\/corpus\/documents\.json/u);

    const countRoot = await createPackageRoot();
    await updateJson(countRoot, "data/corpus/corpus-manifest.json", (manifest) => {
      manifest.chunkCount += 1;
    });
    await seal(countRoot);
    await expectLoadFailure(countRoot, /corpus-count.*data\/corpus\/corpus-manifest\.json/u);
  });

  it("rejects duplicate source, document, chunk, approval, evidence, and rule IDs", async () => {
    const cases: Array<{
      path: BundlePath;
      mutate: (value: any) => void;
      corpus?: boolean;
      lines?: boolean;
    }> = [
      {
        path: "sources/manifest.json",
        mutate: (manifest) => { manifest.sources[1].id = manifest.sources[0].id; },
        corpus: true,
      },
      {
        path: "data/corpus/documents.json",
        mutate: (documents) => { documents[1].sourceId = documents[0].sourceId; },
        corpus: true,
      },
      {
        path: "data/corpus/chunks.jsonl",
        mutate: (chunks) => { chunks[1].id = chunks[0].id; },
        lines: true,
      },
      {
        path: "data/corpus/active-chunks.json",
        mutate: (approvals) => { approvals[1].chunkId = approvals[0].chunkId; },
      },
      {
        path: "data/evidence/verified-excerpts.json",
        mutate: (evidence) => { evidence.push({ ...evidence[0] }); },
      },
      {
        path: "data/rules/kr-moe-school-record-elementary-2026.1.json",
        mutate: (pack) => { pack.rules.push({ ...pack.rules[0] }); },
      },
    ];

    for (const testCase of cases) {
      const root = await createPackageRoot();
      if (testCase.lines) {
        await mutateLinesAndReseal(root, testCase.mutate);
      } else {
        await mutateAndReseal(
          root,
          testCase.path as Exclude<BundlePath, "data/corpus/chunks.jsonl">,
          testCase.mutate,
          testCase.corpus,
        );
      }
      await expectLoadFailure(root, /duplicate-id/u);
    }
  });

  it("cross-checks document and chunk metadata against their source", async () => {
    const documentRoot = await createPackageRoot();
    await mutateAndReseal(documentRoot, "data/corpus/documents.json", (documents) => {
      documents[0].sourceSha256 = "F".repeat(64);
    }, true);
    await expectLoadFailure(documentRoot, /source-document-metadata.*data\/corpus\/documents\.json/u);

    const chunkRoot = await createPackageRoot();
    await mutateLinesAndReseal(chunkRoot, (chunks) => {
      chunks[0].schoolLevels = ["elementary", "middle"];
    });
    await expectLoadFailure(chunkRoot, /source-chunk-metadata.*data\/corpus\/chunks\.jsonl/u);
  });

  it("recomputes chunk text and normalized search hashes", async () => {
    const textHashRoot = await createPackageRoot();
    await mutateLinesAndReseal(textHashRoot, (chunks) => {
      chunks[0].textSha256 = "F".repeat(64);
    });
    await expectLoadFailure(textHashRoot, /chunk-text-hash.*data\/corpus\/chunks\.jsonl/u);

    const searchRoot = await createPackageRoot();
    await mutateLinesAndReseal(searchRoot, (chunks) => {
      chunks[0].searchText = "not normalized corpus text";
    });
    await expectLoadFailure(searchRoot, /chunk-search-text.*data\/corpus\/chunks\.jsonl/u);
  });

  it("requires every active approval to resolve and match its elementary/common scope", async () => {
    const missingRoot = await createPackageRoot();
    await mutateAndReseal(missingRoot, "data/corpus/active-chunks.json", (approvals) => {
      approvals[0].chunkId = "SRC-MISSING:chunk-001";
    });
    await expectLoadFailure(missingRoot, /active-chunk-reference.*data\/corpus\/active-chunks\.json/u);

    const scopeRoot = await createPackageRoot();
    await mutateAndReseal(scopeRoot, "data/corpus/active-chunks.json", (approvals) => {
      approvals[0].scope = "common";
    });
    await expectLoadFailure(scopeRoot, /active-chunk-scope.*data\/corpus\/active-chunks\.json/u);
  });

  it("preserves blank source coordinates but never exposes them as active search chunks", async () => {
    const root = await createPackageRoot();
    const blankChunk = {
      id: "SRC-1:blank-page-002",
      sourceId: "SRC-1",
      authority: 80,
      schoolLevels: ["elementary"],
      locator: { kind: "pdf-page", pdfPage: 2 },
      locatorLabel: "Fixture blank PDF page 2",
      headingPath: [],
      text: "",
      searchText: "",
      textSha256: sha256(""),
    };
    await mutateLinesAndReseal(root, (chunks) => {
      chunks.push(blankChunk);
    });

    const bundle = await loadDataBundle(root);
    assert.equal(bundle.chunkById.has(blankChunk.id), true);
    assert.equal(bundle.activeChunkById.has(blankChunk.id), false);

    await mutateAndReseal(root, "data/corpus/active-chunks.json", (approvals) => {
      approvals.push({
        chunkId: blankChunk.id,
        scope: "elementary",
        reason: "Invalid blank search approval",
      });
    });
    await expectLoadFailure(root, /active-chunk-empty.*data\/corpus\/active-chunks\.json/u);
  });

  it("requires human-verified quote hashes and normalized containment in active chunks", async () => {
    const hashRoot = await createPackageRoot();
    await mutateAndReseal(hashRoot, "data/evidence/verified-excerpts.json", (evidence) => {
      evidence[0].quoteSha256 = "F".repeat(64);
    });
    await expectLoadFailure(hashRoot, /evidence-quote-hash.*data\/evidence\/verified-excerpts\.json/u);

    const secret = "UNIQUE-PRIVATE-QUOTE-DO-NOT-LEAK";
    const containmentRoot = await createPackageRoot();
    await mutateAndReseal(containmentRoot, "data/evidence/verified-excerpts.json", (evidence) => {
      evidence[0].quote = secret;
      evidence[0].quoteSha256 = sha256(secret);
    });
    await expectLoadFailure(
      containmentRoot,
      /evidence-quote-containment.*data\/evidence\/verified-excerpts\.json/u,
      secret,
    );

    const inactiveRoot = await createPackageRoot();
    await mutateAndReseal(inactiveRoot, "data/corpus/active-chunks.json", (approvals) => {
      approvals.shift();
    });
    await expectLoadFailure(inactiveRoot, /evidence-active-reference.*data\/evidence\/verified-excerpts\.json/u);
  });

  it("keeps official evidence and local editorial policy references separate", async () => {
    const editorialRoot = await createPackageRoot();
    await mutateAndReseal(editorialRoot, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
      pack.rules.at(-1).evidenceIds = ["EV-FIXTURE"];
    });
    await expectLoadFailure(editorialRoot, /rule-authority-separation.*data\/rules\//u);

    const officialRoot = await createPackageRoot();
    await mutateAndReseal(officialRoot, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
      const official = pack.rules.find((rule: JsonObject) => rule.id === "OFFICIAL-FIXTURE-REGEX");
      official.profile = "official_plus_editorial";
      official.localPolicyId = "LOCAL-EDITORIAL-POLICY";
    });
    await expectLoadFailure(officialRoot, /rule-authority-separation.*data\/rules\//u);
  });

  it("resolves every field and official rule evidence reference", async () => {
    const fieldRoot = await createPackageRoot();
    await mutateAndReseal(fieldRoot, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
      pack.fields.behavior_opinion.evidenceIds = ["EV-MISSING"];
    });
    await expectLoadFailure(fieldRoot, /rule-evidence-reference.*data\/rules\//u);

    const ruleRoot = await createPackageRoot();
    await mutateAndReseal(ruleRoot, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
      const rule = pack.rules.find((item: JsonObject) => item.id === "OFFICIAL-FIXTURE-REGEX");
      rule.evidenceIds = ["EV-MISSING"];
    });
    await expectLoadFailure(ruleRoot, /rule-evidence-reference.*data\/rules\//u);
  });

  it("requires conflict references to exist and be declared symmetrically", async () => {
    const missingRoot = await createPackageRoot();
    await mutateAndReseal(missingRoot, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
      pack.rules[0].conflictsWith = ["RULE-MISSING"];
    });
    await expectLoadFailure(missingRoot, /rule-conflict-reference.*data\/rules\//u);

    const asymmetricRoot = await createPackageRoot();
    await mutateAndReseal(asymmetricRoot, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
      pack.rules[0].conflictsWith = ["OFFICIAL-FIXTURE-REGEX"];
    });
    await expectLoadFailure(asymmetricRoot, /rule-conflict-symmetry.*data\/rules\//u);
  });

  it("cross-checks fixed length fields and rejects length rules on system-range fields", async () => {
    const mismatchRoot = await createPackageRoot();
    await mutateAndReseal(mismatchRoot, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
      const rule = pack.rules.find((item: JsonObject) => item.id === "LENGTH-ADDRESS");
      rule.maxBytes = 899;
    });
    await expectLoadFailure(mismatchRoot, /length-rule-field.*data\/rules\//u);

    const systemRangeRoot = await createPackageRoot();
    await mutateAndReseal(systemRangeRoot, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
      pack.fields.behavior_opinion.lengthRuleId = "LENGTH-STUDENT-NAME";
    });
    await expectLoadFailure(systemRangeRoot, /length-rule-field.*data\/rules\//u);
  });

  it("compiles bundled regex and rejects backreferences, lookbehind, and zero-length matches", async () => {
    const patterns = [
      "(금지)?\\1",
      "(?<named>금지)\\k<named>",
      "(?<=금지)문구",
      "금지(",
      ".*",
    ];

    for (const pattern of patterns) {
      const root = await createPackageRoot();
      await mutateAndReseal(root, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
        const rule = pack.rules.find((item: JsonObject) => item.id === "OFFICIAL-FIXTURE-REGEX");
        rule.detector.patterns = [pattern];
      });
      await expectLoadFailure(root, /unsafe-regex.*data\/rules\//u, pattern);
    }
  });

  it("uses strict schemas for nested corpus and rule objects", async () => {
    const chunkRoot = await createPackageRoot();
    await mutateLinesAndReseal(chunkRoot, (chunks) => {
      chunks[0].unexpected = "must be rejected";
    });
    await expectLoadFailure(chunkRoot, /schema.*data\/corpus\/chunks\.jsonl/u);

    const ruleRoot = await createPackageRoot();
    await mutateAndReseal(ruleRoot, "data/rules/kr-moe-school-record-elementary-2026.1.json", (pack) => {
      pack.rules[0].unexpected = "must be rejected";
    });
    await expectLoadFailure(ruleRoot, /schema.*data\/rules\//u);
  });
});

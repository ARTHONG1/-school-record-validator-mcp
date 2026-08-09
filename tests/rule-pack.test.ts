import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type {
  FieldKey,
  PhraseRule,
  RulePack,
  ValidationRule,
} from "../src/rule-types.ts";
import { scanPhraseRules } from "../src/scanner.ts";

const RULE_PACK_PATH = "data/rules/kr-moe-school-record-elementary-2026.1.json";

const expectedRuleIds = [
  "LENGTH-STUDENT-NAME",
  "LENGTH-ADDRESS",
  "LENGTH-ACADEMIC-STATUS-SPECIAL",
  "LENGTH-ATTENDANCE-SPECIAL",
  "LENGTH-VOLUNTEER-ACTIVITY",
  "OFFICIAL-DIRECT-OBSERVATION",
  "OFFICIAL-LANGUAGE-TEST",
  "OFFICIAL-CONTEST-PARTICIPATION-AWARD",
  "OFFICIAL-OUTSIDE-AWARD",
  "OFFICIAL-CERTIFICATION-TEST",
  "OFFICIAL-PAPER-PUBLICATION",
  "OFFICIAL-BOOK-PUBLICATION",
  "OFFICIAL-INTELLECTUAL-PROPERTY",
  "OFFICIAL-OVERSEAS-ACTIVITY",
  "OFFICIAL-PARENT-SOCIOECONOMIC-STATUS",
  "OFFICIAL-SCHOLARSHIP",
  "OFFICIAL-SPECIFIC-NAME",
  "OFFICIAL-QUALIFICATION",
  "OFFICIAL-FACTUAL-ACCURACY",
  "OFFICIAL-STUDENT-MATERIAL-CONDITIONS",
  "OFFICIAL-STUDENT-FINAL-DRAFT",
  "OFFICIAL-AI-VERBATIM",
  "OFFICIAL-AI-VERIFICATION",
  "FIELD-ATTENDANCE-PROHIBITED-CONTENT",
  "FIELD-CREATIVE-ACTIVITY-SCOPE",
  "FIELD-VOLUNTEER-SIMPLE-DONATION",
  "FIELD-VOLUNTEER-ELIGIBILITY",
  "FIELD-SUBJECT-PROHIBITED-CONTENT",
  "FIELD-BEHAVIOR-CONTINUOUS-OBSERVATION",
  "EDITORIAL-UNSUPPORTED-SUPERLATIVE",
  "EDITORIAL-HOME-ACTIVITY",
  "EDITORIAL-CAREER-CERTAINTY",
] as const;

const expectedEvidenceIds = [
  "EV-DIRECTIVE-4-2",
  "EV-GUIDE-18-PROHIBITIONS",
  "EV-GUIDE-19-NARRATIVE-AUTHORITY",
  "EV-GUIDE-27-STUDENT-MATERIALS",
  "EV-GUIDE-59-ATTENDANCE",
  "EV-GUIDE-79-CREATIVE-SCOPE",
  "EV-GUIDE-83-VOLUNTEER-SCOPE",
  "EV-GUIDE-84-VOLUNTEER",
  "EV-GUIDE-85-VOLUNTEER-PROCEDURE",
  "EV-GUIDE-100-SUBJECT",
  "EV-GUIDE-102-BEHAVIOR",
  "EV-GUIDE-150-LIMITS",
] as const;

const fieldContract = {
  student_name: {
    lengthPolicy: {
      kind: "conditional-name",
      displayKoreanChars: 20,
      displayLatinChars: 60,
      maxBytes: 60,
    },
    applicableTo: "all-elementary",
    contentRuleMode: "none",
    provenanceMode: "none",
    lengthRuleId: "LENGTH-STUDENT-NAME",
  },
  address: {
    lengthPolicy: { kind: "fixed-bytes", displayKoreanChars: 300, maxBytes: 900, scope: "field" },
    applicableTo: "all-elementary",
    contentRuleMode: "none",
    provenanceMode: "none",
    lengthRuleId: "LENGTH-ADDRESS",
  },
  academic_status_special: {
    lengthPolicy: { kind: "fixed-bytes", displayKoreanChars: 500, maxBytes: 1500, scope: "field" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "none",
    lengthRuleId: "LENGTH-ACADEMIC-STATUS-SPECIAL",
  },
  attendance_special: {
    lengthPolicy: { kind: "fixed-bytes", displayKoreanChars: 500, maxBytes: 1500, scope: "field" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "none",
    lengthRuleId: "LENGTH-ATTENDANCE-SPECIAL",
  },
  creative_autonomy_club_special: {
    lengthPolicy: { kind: "system-range" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
  },
  creative_career_special: {
    lengthPolicy: { kind: "system-range" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
  },
  volunteer_activity: {
    lengthPolicy: { kind: "fixed-bytes", displayKoreanChars: 50, maxBytes: 150, scope: "entry" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "activity-evidence",
    lengthRuleId: "LENGTH-VOLUNTEER-ACTIVITY",
  },
  daily_life_special: {
    lengthPolicy: { kind: "system-range" },
    applicableTo: "special-basic-curriculum",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
  },
  subject_achievement_special: {
    lengthPolicy: { kind: "system-range" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
  },
  behavior_opinion: {
    lengthPolicy: { kind: "system-range" },
    applicableTo: "all-elementary",
    contentRuleMode: "global-prohibitions",
    provenanceMode: "teacher-observation",
  },
} as const;

const detectorFixtures: Record<
  string,
  { field: FieldKey; positive: string; negative: string }
> = {
  "OFFICIAL-LANGUAGE-TEST": {
    field: "behavior_opinion",
    positive: "TOEIC 시험에서 900점을 취득함",
    negative: "영어 의사소통 활동에 꾸준히 참여함",
  },
  "OFFICIAL-CONTEST-PARTICIPATION-AWARD": {
    field: "behavior_opinion",
    positive: "교외 수학 대회에 출전하여 입상함",
    negative: "학급 수학 탐구 발표회에 참여함",
  },
  "OFFICIAL-OUTSIDE-AWARD": {
    field: "behavior_opinion",
    positive: "외부 기관에서 공로상을 받음",
    negative: "외부 기관과 진로 체험을 진행함",
  },
  "OFFICIAL-CERTIFICATION-TEST": {
    field: "behavior_opinion",
    positive: "정보 인증시험에 응시하여 합격함",
    negative: "정보 윤리 수업의 형성평가에 참여함",
  },
  "OFFICIAL-PAPER-PUBLICATION": {
    field: "behavior_opinion",
    positive: "환경 논문을 학회에 투고함",
    negative: "환경 관련 글을 읽고 토론함",
  },
  "OFFICIAL-BOOK-PUBLICATION": {
    field: "behavior_opinion",
    positive: "창작 도서를 출간함",
    negative: "창작 도서를 읽고 감상을 나눔",
  },
  "OFFICIAL-INTELLECTUAL-PROPERTY": {
    field: "behavior_opinion",
    positive: "발명 아이디어로 특허를 출원함",
    negative: "발명 아이디어를 모형으로 구현함",
  },
  "OFFICIAL-OVERSEAS-ACTIVITY": {
    field: "behavior_opinion",
    positive: "방학 중 해외 봉사에 참여함",
    negative: "학교 주변 환경 정화 봉사에 참여함",
  },
  "OFFICIAL-PARENT-SOCIOECONOMIC-STATUS": {
    field: "behavior_opinion",
    positive: "아버지의 직업이 의사임",
    negative: "가족을 배려하는 태도가 돋보임",
  },
  "OFFICIAL-SCHOLARSHIP": {
    field: "behavior_opinion",
    positive: "장학금을 받아 학습에 활용함",
    negative: "친구에게 학습 자료를 나누어 줌",
  },
  "OFFICIAL-SPECIFIC-NAME": {
    field: "behavior_opinion",
    positive: "가람대학교에서 운영한 강좌에 참여함",
    negative: "교육부 자료를 활용해 조사함",
  },
  "OFFICIAL-QUALIFICATION": {
    field: "behavior_opinion",
    positive: "코딩 자격증을 취득함",
    negative: "코딩 활동에서 맡은 역할을 충실히 수행함",
  },
  "FIELD-ATTENDANCE-PROHIBITED-CONTENT": {
    field: "attendance_special",
    positive: "방학 중 어학연수에 참가함",
    negative: "질병 치료로 3일 결석함",
  },
  "FIELD-VOLUNTEER-SIMPLE-DONATION": {
    field: "volunteer_activity",
    positive: "현금을 기부함",
    negative: "복지관 물품을 정리함",
  },
  "FIELD-SUBJECT-PROHIBITED-CONTENT": {
    field: "subject_achievement_special",
    positive: "K-MOOC 강좌를 수료함",
    negative: "학교 수업에서 공개 강의를 비교 분석함",
  },
  "EDITORIAL-UNSUPPORTED-SUPERLATIVE": {
    field: "behavior_opinion",
    positive: "항상 완벽하게 과제를 수행함",
    negative: "관찰 기간 동안 과제를 기한 안에 제출함",
  },
  "EDITORIAL-HOME-ACTIVITY": {
    field: "behavior_opinion",
    positive: "집에서 부모와 함께 실험함",
    negative: "과학실에서 모둠원과 함께 실험함",
  },
  "EDITORIAL-CAREER-CERTAINTY": {
    field: "behavior_opinion",
    positive: "틀림없이 훌륭한 의사가 될 학생임",
    negative: "의학 분야에 관심을 보이며 관련 자료를 탐색함",
  },
};

async function readRulePack(): Promise<RulePack> {
  return JSON.parse(await readFile(RULE_PACK_PATH, "utf8")) as RulePack;
}

function isPhraseRule(rule: ValidationRule): rule is PhraseRule {
  return "detector" in rule;
}

describe("elementary 2026 rule pack", () => {
  it("declares the exact pack identity, authority order, and ten field policies", async () => {
    const pack = await readRulePack();

    assert.equal(pack.id, "kr-moe-school-record-elementary-2026.1");
    assert.equal(pack.schoolLevel, "elementary");
    assert.equal(pack.academicYear, 2026);
    assert.equal(pack.effectiveFrom, "2026-03-01");
    assert.equal(pack.defaultProfile, "official");
    assert.deepEqual(pack.authorityOrder, [100, 80, 10]);
    assert.deepEqual(Object.keys(pack.fields).sort(), Object.keys(fieldContract).sort());

    for (const [key, expected] of Object.entries(fieldContract)) {
      const field = pack.fields[key as FieldKey];
      assert.equal(field.key, key);
      assert.ok(field.label.trim().length > 0, `${key}: label`);
      assert.deepEqual(
        {
          lengthPolicy: field.lengthPolicy,
          applicableTo: field.applicableTo,
          contentRuleMode: field.contentRuleMode,
          provenanceMode: field.provenanceMode,
          ...(field.lengthRuleId === undefined ? {} : { lengthRuleId: field.lengthRuleId }),
        },
        expected,
        key,
      );
      assert.ok(field.evidenceIds.length > 0, `${key}: evidenceIds`);
    }
  });

  it("contains every stable rule ID once and keeps official and editorial profiles separate", async () => {
    const pack = await readRulePack();
    const ids = pack.rules.map((rule) => rule.id);

    assert.deepEqual([...ids].sort(), [...expectedRuleIds].sort());
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(pack.localPolicies, {
      "LOCAL-EDITORIAL-POLICY": {
        label: "자체 편집 경고",
        disclaimer: "교육부 명시 금지가 아닌 보수적 문장 품질 검토 항목",
      },
    });

    for (const rule of pack.rules) {
      assert.ok(rule.title.trim().length > 0, `${rule.id}: title`);
      assert.ok(rule.message.trim().length > 0, `${rule.id}: message`);
      assert.ok(rule.recommendation.trim().length > 0, `${rule.id}: recommendation`);
      assert.ok(Array.isArray(rule.exceptions), `${rule.id}: exceptions`);
      assert.deepEqual(rule.conflictsWith ?? [], [], `${rule.id}: initial conflicts`);

      if (rule.authorityClass === "official-policy") {
        assert.equal(rule.profile, "official", rule.id);
        assert.ok(rule.evidenceIds.length > 0, `${rule.id}: evidenceIds`);
        assert.equal("localPolicyId" in rule, false, rule.id);
      } else {
        assert.equal(rule.profile, "official_plus_editorial", rule.id);
        assert.equal(rule.localPolicyId, "LOCAL-EDITORIAL-POLICY", rule.id);
        assert.equal("evidenceIds" in rule, false, rule.id);
      }
    }
  });

  it("connects each fixed byte policy to exactly one matching length rule", async () => {
    const pack = await readRulePack();
    const lengthRules = pack.rules.filter((rule) => "kind" in rule && rule.kind === "length");

    assert.equal(lengthRules.length, 5);
    for (const field of Object.values(pack.fields)) {
      if (field.lengthPolicy.kind === "system-range") {
        assert.equal(field.lengthRuleId, undefined, field.key);
        assert.equal(lengthRules.some((rule) => rule.field === field.key), false, field.key);
        continue;
      }

      const matching = lengthRules.filter((rule) => rule.id === field.lengthRuleId);
      assert.equal(matching.length, 1, field.key);
      assert.equal(matching[0]?.field, field.key);
      assert.equal(matching[0]?.maxBytes, field.lengthPolicy.maxBytes);
      assert.deepEqual(matching[0]?.evidenceIds, field.evidenceIds);
    }
  });

  it("references every verified evidence ID", async () => {
    const pack = await readRulePack();
    const referenced = new Set<string>();

    for (const field of Object.values(pack.fields)) {
      field.evidenceIds.forEach((id) => referenced.add(id));
    }
    for (const rule of pack.rules) {
      if (rule.authorityClass === "official-policy") {
        rule.evidenceIds.forEach((id) => referenced.add(id));
      }
    }

    assert.deepEqual([...referenced].sort(), [...expectedEvidenceIds].sort());
  });

  it("links multi-page volunteer requirements and does not claim unsupported subject exceptions", async () => {
    const pack = await readRulePack();
    const volunteerRule = pack.rules.find((rule) => rule.id === "FIELD-VOLUNTEER-ELIGIBILITY");
    const subjectRule = pack.rules.find((rule) => rule.id === "FIELD-SUBJECT-PROHIBITED-CONTENT");

    assert.deepEqual(volunteerRule?.evidenceIds, [
      "EV-GUIDE-83-VOLUNTEER-SCOPE",
      "EV-GUIDE-84-VOLUNTEER",
      "EV-GUIDE-85-VOLUNTEER-PROCEDURE",
    ]);
    assert.deepEqual(subjectRule?.exceptions, []);
  });

  it("keeps bundled regular expressions compilable, non-empty, and free of backreferences or lookbehind", async () => {
    const pack = await readRulePack();

    for (const rule of pack.rules.filter(isPhraseRule)) {
      assert.ok(rule.detector.patterns.length > 0, `${rule.id}: patterns`);
      for (const pattern of rule.detector.patterns) {
        assert.ok(pattern.length > 0, `${rule.id}: empty pattern`);
        assert.doesNotMatch(pattern, /(^|[^\\])\\[1-9]/u, `${rule.id}: backreference`);
        assert.doesNotMatch(pattern, /\(\?<([=!])/u, `${rule.id}: lookbehind`);
        const expression = new RegExp(pattern, "giu");
        assert.equal(expression.test(""), false, `${rule.id}: zero-length match`);
      }
    }
  });

  it("provides semantic verification metadata for every phrase rule", async () => {
    const pack = await readRulePack();
    const phraseRules = pack.rules.filter(isPhraseRule);

    assert.ok(phraseRules.length > 0);
    for (const rule of phraseRules) {
      assert.ok(rule.semanticReview, `${rule.id}: semanticReview`);
      assert.ok(rule.semanticReview.concept.trim().length > 0, `${rule.id}: concept`);
      assert.ok(rule.semanticReview.semanticHints.length > 0, `${rule.id}: semanticHints`);
      assert.ok(rule.semanticReview.confirmPatterns.length > 0, `${rule.id}: confirmPatterns`);
      assert.ok(rule.semanticReview.supportPatterns.length > 0, `${rule.id}: supportPatterns`);
      assert.ok(rule.semanticReview.negativePatterns.length > 0, `${rule.id}: negativePatterns`);
    }
  });

  it("matches every detector fixture and rejects its nearby non-example", async () => {
    const pack = await readRulePack();
    const phraseRules = pack.rules.filter(isPhraseRule);

    assert.deepEqual(
      phraseRules.map((rule) => rule.id).sort(),
      Object.keys(detectorFixtures).sort(),
    );

    for (const rule of phraseRules) {
      const fixture = detectorFixtures[rule.id];
      const field = pack.fields[fixture.field];
      const positive = scanPhraseRules(
        fixture.positive,
        [rule],
        "official_plus_editorial",
        field,
      );
      const negative = scanPhraseRules(
        fixture.negative,
        [rule],
        "official_plus_editorial",
        field,
      );

      assert.ok(positive.some((match) => match.ruleId === rule.id), `${rule.id}: positive`);
      assert.deepEqual(negative, [], `${rule.id}: negative`);
    }
  });

  it("runs official rules in both profiles and editorial rules only in the expanded profile", async () => {
    const pack = await readRulePack();
    const languageRule = pack.rules.find((rule) => rule.id === "OFFICIAL-LANGUAGE-TEST");
    const editorialRule = pack.rules.find(
      (rule) => rule.id === "EDITORIAL-UNSUPPORTED-SUPERLATIVE",
    );
    assert.ok(languageRule && isPhraseRule(languageRule));
    assert.ok(editorialRule && isPhraseRule(editorialRule));
    const field = pack.fields.behavior_opinion;

    assert.equal(scanPhraseRules("TOEIC", [languageRule], "official", field).length, 1);
    assert.equal(
      scanPhraseRules("TOEIC", [languageRule], "official_plus_editorial", field).length,
      1,
    );
    assert.equal(scanPhraseRules("항상", [editorialRule], "official", field).length, 0);
    assert.equal(
      scanPhraseRules("항상", [editorialRule], "official_plus_editorial", field).length,
      1,
    );
  });

  it("detects every official language and Chinese-character test listed on printed page 18", async () => {
    const pack = await readRulePack();
    const rule = pack.rules.find((candidate) => candidate.id === "OFFICIAL-LANGUAGE-TEST");
    assert.ok(rule && isPhraseRule(rule));
    const field = pack.fields.behavior_opinion;
    const officialTestNames = [
      "TOEIC",
      "TOEFL",
      "TEPS",
      "HSK",
      "JPT",
      "JLPT",
      "DELF",
      "DALF",
      "ZD",
      "TESTDAF",
      "DSH",
      "DSD",
      "TORFL",
      "DELE",
      "상공회의소한자시험",
      "한자능력검정",
      "실용한자",
      "한자급수자격 검정",
      "YBM 상무한검",
      "한자급수인증시험",
      "한자자격검정",
    ];

    for (const testName of officialTestNames) {
      const matches = scanPhraseRules(`${testName}에 참여함`, [rule], "official", field);
      assert.equal(matches[0]?.ruleId, rule.id, testName);
    }
  });

  it("does not apply specific-name review to volunteer activity", async () => {
    const pack = await readRulePack();
    const rule = pack.rules.find((candidate) => candidate.id === "OFFICIAL-SPECIFIC-NAME");
    assert.ok(rule && isPhraseRule(rule));

    assert.equal(
      scanPhraseRules(
        "가람센터에서 봉사함",
        [rule],
        "official",
        pack.fields.volunteer_activity,
      ).length,
      0,
    );
  });
});

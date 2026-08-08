import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficialPhraseRule } from "../src/rule-types.ts";
import type { BatchEntry } from "../src/validator-types.ts";
import { createValidator } from "../src/validator.ts";
import {
  buildTestBundle,
  completeObservation,
  testOfficialPhraseRule,
} from "./helpers/validator-fixture.ts";

describe("aggregate record validator", () => {
  it("blocks official prohibited content with real citations in deterministic order", () => {
    const validator = createValidator(buildTestBundle());
    const result = validator.validate({
      field: "behavior_opinion",
      text: "TOEIC에서 900점을 취득하고 전국대회에서 수상함.",
      provenance: completeObservation(),
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.findings.map((finding) => finding.ruleId), [
      "OFFICIAL-LANGUAGE-TEST",
      "OFFICIAL-CONTEST-PARTICIPATION-AWARD",
    ]);
    assert.ok(result.findings.every((finding) => finding.evidence[0]?.locatorLabel.includes("인쇄 18쪽")));
    assert.ok(result.findings.every((finding) => finding.authority === 80));
  });

  it("does not report an obsolete fixed behavior-opinion limit", () => {
    const validator = createValidator(buildTestBundle());
    const result = validator.validate({
      field: "behavior_opinion",
      text: "협력적인 태도를 보임. ".repeat(80),
      provenance: completeObservation(),
    });

    assert.equal(result.lengthPolicy.kind, "system-range");
    assert.equal(result.findings.some((finding) => finding.category === "length"), false);
  });

  it("suppresses symmetric conflicting decisions and returns one review finding", () => {
    const conflictRules = [
      testOfficialPhraseRule({
        id: "CONFLICT-HIGH",
        evidenceId: "EV-DIRECTIVE-4-2",
        outcome: "block",
        pattern: "충돌문구",
        conflictsWith: ["CONFLICT-LOW"],
      }),
      testOfficialPhraseRule({
        id: "CONFLICT-LOW",
        evidenceId: "EV-GUIDE-18-PROHIBITIONS",
        outcome: "review",
        pattern: "충돌문구",
        conflictsWith: ["CONFLICT-HIGH"],
      }),
    ];
    const validator = createValidator(buildTestBundle({ rules: conflictRules }));

    const result = validator.validate({ field: "attendance_special", text: "충돌문구" });

    assert.equal(result.status, "review");
    assert.equal(result.findings.length, 1);
    assert.deepEqual(result.findings[0], {
      ruleId: "SOURCE-RULE-CONFLICT",
      authorityClass: "official-policy",
      authority: 100,
      outcome: "review",
      category: "conflict",
      message: "서로 충돌하도록 선언된 규칙이 같은 입력에서 탐지되었습니다.",
      recommendation: "양쪽 공식 근거를 사람이 함께 확인한 뒤 기재 여부를 결정하세요.",
      evidence: result.findings[0]?.evidence,
      conflictingRuleIds: ["CONFLICT-HIGH", "CONFLICT-LOW"],
    });
    assert.deepEqual(
      result.findings[0]?.evidence.map((item) => item.evidenceId).sort(),
      ["EV-DIRECTIVE-4-2", "EV-GUIDE-18-PROHIBITIONS"],
    );
    assert.equal(JSON.stringify(result).includes("CONFLICT-HIGH 관련 문구"), false);
  });

  it("selects checks by field and rejects daily-life use outside the special basic curriculum", () => {
    const validator = createValidator(buildTestBundle());

    assert.equal(validator.validate({ field: "student_name", text: "TOEIC" }).status, "pass");
    assert.equal(
      validator.validate({
        field: "behavior_opinion",
        text: "MOOC 내용을 토론함.",
        provenance: completeObservation(),
      }).status,
      "pass",
    );
    assert.deepEqual(
      validator.validate({ field: "attendance_special", text: "교외대회 참가" }).findings.map((finding) => finding.ruleId),
      ["FIELD-ATTENDANCE-PROHIBITED-CONTENT"],
    );
    assert.throws(
      () => validator.validate({
        field: "daily_life_special",
        text: "UNIQUE-DAILY-LIFE-SECRET",
        curriculum: "general",
        provenance: completeObservation(),
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /special_basic/u);
        assert.equal(error.message.includes("UNIQUE-DAILY-LIFE-SECRET"), false);
        return true;
      },
    );
  });

  it("reports missing teacher-observation provenance as context", () => {
    const validator = createValidator(buildTestBundle());
    const activityContext = {
      domestic: true,
      organizers: [{ kind: "education_authority" as const }],
      schoolApproved: true,
    };
    const incomplete = validator.validate({
      field: "creative_career_special",
      text: "진로 탐색 활동에 참여함.",
      provenance: { aiUse: "none" },
      activityContext,
    });
    assert.equal(incomplete.findings.some((finding) => finding.ruleId === "OFFICIAL-DIRECT-OBSERVATION"), false);
    assert.equal(incomplete.contentStatus, "pass");
    assert.equal(incomplete.contextStatus, "needs_context");
    assert.equal(incomplete.status, "needs_context");
    assert.ok(incomplete.needsContext.some((item) => item.ruleId === "OFFICIAL-DIRECT-OBSERVATION"));

    const complete = validator.validate({
      field: "creative_career_special",
      text: "진로 탐색 활동에 참여함.",
      provenance: completeObservation(),
      activityContext,
    });
    assert.equal(complete.status, "pass");
  });

  it("suppresses specific-name review only for an eligible matching creative organizer", () => {
    const specificNameRule: OfficialPhraseRule = {
      id: "OFFICIAL-SPECIFIC-NAME",
      title: "특정 기관명 검토",
      authorityClass: "official-policy",
      profile: "official",
      appliesTo: ["creative_career_special"],
      message: "특정 기관명의 허용 맥락을 확인해야 합니다.",
      recommendation: "주최기관과 승인 조건을 확인하십시오.",
      exceptions: [],
      outcome: "review",
      evidenceIds: ["EV-GUIDE-19-NARRATIVE-AUTHORITY"],
      detector: {
        type: "regex-any",
        patterns: ["[가-힣A-Za-z0-9]{2,30}(?:센터|연구소)"],
      },
    };
    const rules = [...buildTestBundle().rules.rules, specificNameRule];
    const validator = createValidator(buildTestBundle({ rules }));
    const baseInput = {
      field: "creative_career_special" as const,
      text: "가람교육센터에서 진로 탐색 활동에 참여함.",
      provenance: { aiUse: "none" as const },
    };

    const eligible = validator.validate({
      ...baseInput,
      activityContext: {
        domestic: true,
        organizers: [{ kind: "education_authority" as const, name: "가람교육센터" }],
        schoolApproved: true,
      },
    });
    assert.equal(
      eligible.findings.some((finding) => finding.ruleId === "OFFICIAL-SPECIFIC-NAME"),
      false,
    );

    for (const activityContext of [
      {
        domestic: true,
        organizers: [{ kind: "education_authority" as const, name: "다른교육센터" }],
        schoolApproved: true,
      },
      {
        domestic: true,
        organizers: [{ kind: "external" as const, name: "가람교육센터" }],
        schoolApproved: true,
      },
    ]) {
      const result = validator.validate({ ...baseInput, activityContext });
      assert.equal(
        result.findings.some((finding) => finding.ruleId === "OFFICIAL-SPECIFIC-NAME"),
        true,
      );
    }
  });

  it("preserves batch order and IDs while aggregating the worst status", () => {
    const validator = createValidator(buildTestBundle());
    const entries: BatchEntry[] = [
      { entryId: "review-first", field: "behavior_opinion", text: "관찰문", provenance: completeObservation({ aiUse: "proofreading" }) },
      { entryId: "pass-second", field: "student_name", text: "김학생" },
      { entryId: "blocked-third", field: "attendance_special", text: "가".repeat(501) },
    ];

    const result = validator.validateBatch(entries);

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.entries.map((entry) => entry.entryId), ["review-first", "pass-second", "blocked-third"]);
    assert.deepEqual(result.entries.map((entry) => entry.result.status), ["review", "pass", "blocked"]);
  });

  it("rejects invalid batches atomically without including submitted text in errors", () => {
    const validator = createValidator(buildTestBundle());
    const secret = "UNIQUE-BATCH-STUDENT-SECRET-2026";

    assert.throws(() => validator.validateBatch([]), /1 to 100/u);
    assert.throws(
      () => validator.validateBatch(Array.from({ length: 101 }, (_, index) => ({
        entryId: `entry-${index}`,
        field: "student_name" as const,
        text: "김학생",
      }))),
      /1 to 100/u,
    );
    assert.throws(
      () => validator.validateBatch([
        { entryId: "same", field: "student_name", text: "김학생" },
        { entryId: "same", field: "daily_life_special", text: secret, curriculum: "general" },
      ]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /entryId/u);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
    assert.throws(
      () => validator.validateBatch([
        { entryId: "valid", field: "student_name", text: "김학생" },
        { entryId: "invalid", field: "daily_life_special", text: secret, curriculum: "general" },
      ]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  });

  it("truncates matched text to 80 code points and never returns the full submitted text", () => {
    const longRule = testOfficialPhraseRule({
      id: "LONG-SENSITIVE-MATCH",
      evidenceId: "EV-GUIDE-18-PROHIBITIONS",
      outcome: "block",
      pattern: "UNIQUE-SECRET-X{120}",
    });
    const validator = createValidator(buildTestBundle({ rules: [longRule] }));
    const secret = `UNIQUE-SECRET-${"X".repeat(120)}`;

    const result = validator.validate({ field: "attendance_special", text: secret });
    const serialized = JSON.stringify(result);

    assert.equal(Array.from(result.findings[0]?.matchedText ?? "").length, 80);
    assert.equal(serialized.includes(secret), false);
    assert.equal(Object.hasOwn(result, "text"), false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSemanticVerifier } from "../src/semantic-verifier.ts";
import { buildTestBundle } from "./helpers/validator-fixture.ts";

const bundle = buildTestBundle();
const verifier = createSemanticVerifier(bundle);

describe("semantic candidate verification", () => {
  it("lets the external AI submit a candidate while MCP owns the final disposition", () => {
    const result = verifier.verify({
      entries: [{
        entryId: "record_1",
        text: "TOEIC 성적을 확인함.",
        field: "subject_achievement_special",
        profile: "official_plus_editorial",
        initialStatus: "pass_no_match",
        candidates: [{
          candidateId: "candidate_1",
          ruleId: "OFFICIAL-LANGUAGE-TEST",
          spanText: "TOEIC",
        }],
      }],
    });

    assert.equal(result.status, "prohibited");
    assert.equal(result.entries[0]?.candidates[0]?.verification, "confirmed");
    assert.equal(result.entries[0]?.candidates[0]?.finalRecommendation, "prohibited");
  });

  it("requires one retry for a bad span and never converts the first invalid candidate to pass", () => {
    const first = verifier.verify({
      entries: [{
        entryId: "record_1",
        text: "TOEIC 성적을 확인함.",
        field: "subject_achievement_special",
        profile: "official_plus_editorial",
        initialStatus: "pass_no_match",
        candidates: [{ candidateId: "candidate_2", ruleId: "OFFICIAL-LANGUAGE-TEST", spanText: "영어시험" }],
      }],
    });
    const candidate = first.entries[0]?.candidates[0];
    assert.equal(first.processingStatus, "retry_required");
    assert.equal(first.status, null);
    assert.equal(candidate?.retryable, true);
    assert.ok(candidate?.retryToken);

    const second = verifier.verify({
      entries: [{
        entryId: "record_1",
        text: "TOEIC 성적을 확인함.",
        field: "subject_achievement_special",
        profile: "official_plus_editorial",
        initialStatus: "pass_no_match",
        candidates: [{
          candidateId: "candidate_2",
          ruleId: "OFFICIAL-LANGUAGE-TEST",
          spanText: "영어시험",
          retryToken: candidate?.retryToken,
        }],
      }],
    });
    assert.equal(second.status, "teacher_review");
    assert.equal(second.entries[0]?.finalRecommendation, "teacher_review");
  });
});

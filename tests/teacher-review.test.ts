import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTeacherReviewService } from "../src/teacher-review.ts";
import { createValidator } from "../src/validator.ts";
import { buildTestBundle } from "./helpers/validator-fixture.ts";

const service = createTeacherReviewService(createValidator(buildTestBundle()));

describe("teacher-facing review adapter", () => {
  it("passes a clean subject record without provenance metadata", () => {
    const result = service.review({
      entries: [{
        entryId: "record_1",
        text: "빗면을 이용하면 필요한 힘이 줄어드는 까닭을 설명하고 활용 사례를 조사하여 공유함.",
      }],
    });

    assert.equal(result.entries[0]?.status, "pass");
    assert.equal(result.entries[0]?.issues.length, 0);
    assert.match(result.entries[0]?.teacherChecks.join(" ") ?? "", /실제 수행/u);
  });

  it("maps editorial and length findings to revise and official prohibitions to prohibited", () => {
    const result = service.review({
      entries: [
        { entryId: "clean", text: "실험 결과를 비교하여 설명함." },
        { entryId: "editorial", text: "전교에서 가장 완벽하게 실험함." },
        { entryId: "official", text: "TOEIC에서 우수한 성적을 거둠." },
        { entryId: "length", field: "attendance_special", text: "가".repeat(501) },
      ],
    });

    assert.deepEqual(
      result.entries.map((entry) => entry.status),
      ["pass", "revise", "prohibited", "revise"],
    );
    assert.deepEqual(result.counts, { total: 4, pass: 1, revise: 2, prohibited: 1 });
  });

  it("does not echo full submitted text or invent a suggested revision", () => {
    const secret = "PRIVATE-STUDENT-SENTENCE-2026";
    const result = service.review({
      entries: [{ entryId: "record_1", text: secret }],
    });

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(secret), false);
    assert.equal("suggestedRevision" in result.entries[0]!, false);
    assert.match(result.rewritePolicy, /입력 문장에 이미 확인된 사실/u);
  });
});

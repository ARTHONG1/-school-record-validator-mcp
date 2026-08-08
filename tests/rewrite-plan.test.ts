import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRewritePlan } from "../src/rewrite-plan.ts";

const issue = (status: "revise" | "prohibited", matchedText?: string) => ({
  ruleId: "RULE-1",
  kind: status === "prohibited" ? "official" as const : "editorial" as const,
  status,
  reason: "검토 이유",
  improvement: "구체적인 관찰 사실로 수정",
  ...(matchedText ? { matchedText } : {}),
  citations: [],
});

describe("external AI rewrite plan", () => {
  it("does not request a rewrite for a passing entry", () => {
    const plan = createRewritePlan("pass", [], []);
    assert.equal(plan.action, "none");
    assert.equal(plan.requiresRevalidation, false);
  });

  it("asks the external AI to rewrite an editorial issue", () => {
    const plan = createRewritePlan("revise", [issue("revise", "항상")], ["빈도와 변화로 바꾸어 서술"]);
    assert.equal(plan.action, "rewrite");
    assert.equal(plan.requiresRevalidation, true);
    assert.deepEqual(plan.mustRemove, []);
    assert.match(plan.instructions.join(" "), /빈도와 변화/u);
  });

  it("does not invent a rewrite for a prohibited core claim", () => {
    const plan = createRewritePlan("prohibited", [issue("prohibited", "교외대회 수상")], []);
    assert.equal(plan.action, "ask_evidence");
    assert.deepEqual(plan.mustRemove, ["교외대회 수상"]);
    assert.ok(plan.neededEvidence.length > 0);
    assert.equal(plan.requiresRevalidation, true);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateActivityContext, validateVolunteerContext } from "../src/activity-context.ts";

describe("creative activity context validation", () => {
  it("accepts a domestic activity wholly planned and organized by the school", () => {
    assert.deepEqual(
      validateActivityContext({
        domestic: true,
        inSchoolEducationPlan: true,
        organizers: [{ kind: "school", name: "가람초등학교" }],
      }),
      [],
    );
  });

  it("accepts a domestic activity organized only by other elementary schools with approval", () => {
    assert.deepEqual(
      validateActivityContext({
        domestic: true,
        schoolApproved: true,
        organizers: [{ kind: "other_elementary_school" }],
      }),
      [],
    );
  });

  it("blocks an external organizer even when a school is also an organizer", () => {
    assert.deepEqual(
      validateActivityContext({
        domestic: true,
        inSchoolEducationPlan: true,
        organizers: [{ kind: "school" }, { kind: "external" }],
      }),
      [{ ruleId: "FIELD-CREATIVE-ACTIVITY-SCOPE", outcome: "block" }],
    );
  });

  it("blocks overseas activity", () => {
    assert.deepEqual(
      validateActivityContext({ domestic: false, organizers: [{ kind: "school" }] }),
      [{ ruleId: "FIELD-CREATIVE-ACTIVITY-SCOPE", outcome: "block" }],
    );
  });

  it("asks for review when eligibility metadata is incomplete", () => {
    assert.deepEqual(validateActivityContext({ domestic: true, organizers: [] }), [
      { ruleId: "FIELD-CREATIVE-ACTIVITY-SCOPE", outcome: "review" },
    ]);
  });
});

describe("volunteer activity context validation", () => {
  it("accepts a school-plan service activity with evidence", () => {
    assert.deepEqual(
      validateVolunteerContext({ planType: "school", evidenceAvailable: true, activityKind: "service" }),
      [],
    );
  });

  it("accepts an approved individual-plan service activity with evidence", () => {
    assert.deepEqual(
      validateVolunteerContext({
        planType: "individual",
        schoolApproved: true,
        evidenceAvailable: true,
        activityKind: "service",
      }),
      [],
    );
  });

  it("blocks simple donations", () => {
    assert.deepEqual(
      validateVolunteerContext({
        planType: "school",
        evidenceAvailable: true,
        activityKind: "simple_donation",
      }),
      [{ ruleId: "FIELD-VOLUNTEER-ELIGIBILITY", outcome: "block" }],
    );
  });

  it("blocks an unapproved individual plan", () => {
    assert.deepEqual(
      validateVolunteerContext({
        planType: "individual",
        schoolApproved: false,
        evidenceAvailable: true,
        activityKind: "service",
      }),
      [{ ruleId: "FIELD-VOLUNTEER-ELIGIBILITY", outcome: "block" }],
    );
  });

  it("asks for review when plan, evidence, or activity kind is unknown", () => {
    assert.deepEqual(validateVolunteerContext({ planType: "unknown" }), [
      { ruleId: "FIELD-VOLUNTEER-ELIGIBILITY", outcome: "review" },
    ]);
  });
});

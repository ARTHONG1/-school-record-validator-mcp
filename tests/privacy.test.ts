import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGuidanceSearch } from "../src/search.ts";
import { createValidator } from "../src/validator.ts";
import { buildTestBundle, completeObservation } from "./helpers/validator-fixture.ts";

interface CapturedWrites<T> {
  result: T;
  stdout: string;
  stderr: string;
}

function captureProcessWrites<T>(run: () => T): CapturedWrites<T> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  function capture(destination: string[]) {
    return ((chunk: string | Uint8Array, encodingOrCallback?: unknown, callback?: unknown) => {
      destination.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      if (typeof encodingOrCallback === "function") encodingOrCallback();
      if (typeof callback === "function") callback();
      return true;
    }) as typeof process.stdout.write;
  }

  process.stdout.write = capture(stdout);
  process.stderr.write = capture(stderr);
  try {
    return { result: run(), stdout: stdout.join(""), stderr: stderr.join("") };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

function errorMessage(run: () => unknown): string {
  try {
    run();
  } catch (error: unknown) {
    assert.ok(error instanceof Error);
    return error.message;
  }
  assert.fail("Expected operation to reject its input");
}

describe("student-record privacy and input limits", () => {
  it("never writes submitted student text to stdout or stderr", () => {
    const validator = createValidator(buildTestBundle());
    const secret = "학생 민감 기록 UNIQUE-STUDENT-SECRET-2026";

    const captured = captureProcessWrites(() => {
      validator.validate({
        field: "behavior_opinion",
        text: secret,
        provenance: completeObservation(),
      });
      const rejected = errorMessage(() => validator.validate({
        field: "behavior_opinion",
        text: `${secret}${"가".repeat(200_001)}`,
        provenance: completeObservation(),
      }));
      assert.equal(rejected.includes(secret), false);
    });

    assert.equal(captured.stdout.includes(secret), false);
    assert.equal(captured.stderr.includes(secret), false);
  });

  it("accepts 200,000 characters and rejects 200,001 without echoing the input", () => {
    const validator = createValidator(buildTestBundle());
    const acceptedText = "가".repeat(200_000);
    assert.doesNotThrow(() => validator.validate({
      field: "behavior_opinion",
      text: acceptedText,
      provenance: completeObservation(),
    }));

    const secret = `UNIQUE-OVER-LIMIT-STUDENT-TEXT-${"가".repeat(200_001)}`;
    const message = errorMessage(() => validator.validate({
      field: "behavior_opinion",
      text: secret,
      provenance: completeObservation(),
    }));
    assert.match(message, /1 to 200000 characters/u);
    assert.equal(message.includes(secret), false);
  });

  it("accepts 100 batch entries and rejects 101 atomically", () => {
    const validator = createValidator(buildTestBundle());
    const entries = Array.from({ length: 101 }, (_, index) => ({
      entryId: `entry-${index}`,
      field: "student_name" as const,
      text: "김학생",
    }));

    assert.equal(validator.validateBatch(entries.slice(0, 100)).entries.length, 100);
    assert.throws(() => validator.validateBatch(entries), /1 to 100 items/u);
  });

  it("accepts a 200-character search and rejects 201 characters", () => {
    const search = createGuidanceSearch(buildTestBundle());

    assert.doesNotThrow(() => search.searchGuidance("가".repeat(200)));
    assert.throws(() => search.searchGuidance("가".repeat(201)), /1 and 200 characters/u);
  });
});

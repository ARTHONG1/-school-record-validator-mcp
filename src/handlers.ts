import { z } from "zod";
import type { DataBundle } from "./data-types.ts";
import type { EvidenceService } from "./evidence.ts";
import {
  formatBatchValidationResult,
  formatFieldList,
  formatRuleExplanation,
  formatRulePackInfo,
  formatSearchResults,
  formatTeacherReviewResult,
  formatSourceExcerpt,
  formatValidationResult,
} from "./format.ts";
import { inputParsers, outputSchemas } from "./schemas.ts";
import type { GuidanceSearch } from "./search.ts";
import type { FieldSpec } from "./rule-types.ts";
import { createTeacherReviewService } from "./teacher-review.ts";
import type { BatchEntry, RecordValidator, ValidationInput } from "./validator-types.ts";

export interface Services {
  bundle: DataBundle;
  validator: RecordValidator;
  search: GuidanceSearch;
  evidence: EvidenceService;
}

interface TextContent {
  type: "text";
  text: string;
}

interface ToolErrorResult {
  content: [TextContent];
  isError: true;
  structuredContent?: undefined;
}

interface ToolSuccessResult<T extends Record<string, unknown>> {
  content: [TextContent];
  structuredContent: T;
  isError?: undefined;
}

class ToolInputError extends Error {}

function parseInput<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  try {
    return schema.parse(value) as z.output<S>;
  } catch (error) {
    if (error instanceof z.ZodError) throw new ToolInputError();
    throw error;
  }
}

function success<T extends Record<string, unknown>>(
  output: T,
  text: string,
): ToolSuccessResult<T> {
  return {
    content: [{ type: "text", text }],
    structuredContent: { ...output },
  };
}

function inputError(): ToolErrorResult {
  return {
    content: [{ type: "text", text: "입력 오류: 요청 값과 지원 범위를 확인하세요." }],
    isError: true,
  };
}

function isExpectedServiceInputError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return [
    "Invalid validation input:",
    "Invalid batch input:",
    "sourceIds contains an unknown source ID",
    "Unknown or inactive chunkId:",
    "Unknown ruleId:",
  ].some((prefix) => error.message.startsWith(prefix));
}

function handleExpectedError(error: unknown): ToolErrorResult {
  if (error instanceof ToolInputError || isExpectedServiceInputError(error)) {
    return inputError();
  }
  throw error;
}

function fieldsFromBundle(bundle: DataBundle): FieldSpec[] {
  return Object.values(bundle.rules.fields).map((field) => ({
    ...field,
    evidenceIds: [...field.evidenceIds] as [string, ...string[]],
  }));
}

export function createHandlers(services: Services) {
  const teacherReview = createTeacherReviewService(services.validator);

  return {
    async check_school_record(args: unknown) {
      try {
        const input = parseInput(inputParsers.check_school_record, args);
        const domainResult = teacherReview.review(input);
        const output = outputSchemas.check_school_record.parse(domainResult);
        return success({ ...output }, formatTeacherReviewResult(output));
      } catch (error) {
        return handleExpectedError(error);
      }
    },

    async validate_record_text(args: unknown) {
      try {
        const input = parseInput(inputParsers.validate_record_text, args);
        const domainResult = services.validator.validate(input as ValidationInput);
        const output = outputSchemas.validate_record_text.parse(domainResult);
        return success({ ...output }, formatValidationResult(output));
      } catch (error) {
        return handleExpectedError(error);
      }
    },

    async validate_record_batch(args: unknown) {
      try {
        const input = parseInput(inputParsers.validate_record_batch, args);
        const domainResult = services.validator.validateBatch(input.entries as BatchEntry[]);
        const output = outputSchemas.validate_record_batch.parse(domainResult);
        return success({ ...output }, formatBatchValidationResult(output));
      } catch (error) {
        return handleExpectedError(error);
      }
    },

    async search_record_guidance(args: unknown) {
      try {
        const input = parseInput(inputParsers.search_record_guidance, args);
        const domainResults = services.search.searchGuidance(input.query, {
          limit: input.limit,
          ...(input.sourceIds ? { sourceIds: input.sourceIds } : {}),
          ...(input.sourceRoles ? { sourceRoles: input.sourceRoles } : {}),
        });
        const output = outputSchemas.search_record_guidance.parse({ results: domainResults });
        return success({ ...output }, formatSearchResults(output.results));
      } catch (error) {
        return handleExpectedError(error);
      }
    },

    async get_source_excerpt(args: unknown) {
      try {
        const input = parseInput(inputParsers.get_source_excerpt, args);
        const domainResult = services.evidence.getSourceExcerpt(input.chunkId);
        const output = outputSchemas.get_source_excerpt.parse(domainResult);
        return success({ ...output }, formatSourceExcerpt(output));
      } catch (error) {
        return handleExpectedError(error);
      }
    },

    async explain_record_rule(args: unknown) {
      try {
        const input = parseInput(inputParsers.explain_record_rule, args);
        const domainResult = services.evidence.explainRule(input.ruleId);
        const output = outputSchemas.explain_record_rule.parse(domainResult);
        return success({ ...output }, formatRuleExplanation(output));
      } catch (error) {
        return handleExpectedError(error);
      }
    },

    async list_record_fields(args: unknown) {
      try {
        parseInput(inputParsers.list_record_fields, args);
        const fields = fieldsFromBundle(services.bundle);
        const output = outputSchemas.list_record_fields.parse({
          rulePackId: services.bundle.rules.id,
          fields,
        });
        return success({ ...output }, formatFieldList(fields));
      } catch (error) {
        return handleExpectedError(error);
      }
    },

    async rule_pack_info(args: unknown) {
      try {
        parseInput(inputParsers.rule_pack_info, args);
        const rules = services.bundle.rules;
        const output = outputSchemas.rule_pack_info.parse({
          rulePackId: rules.id,
          schoolLevel: rules.schoolLevel,
          academicYear: rules.academicYear,
          effectiveFrom: rules.effectiveFrom,
          defaultProfile: rules.defaultProfile,
          authorityOrder: rules.authorityOrder,
          sources: services.bundle.sources.map((source) => ({
            sourceId: source.id,
            title: source.title,
            role: source.role,
            authority: source.authority,
            schoolLevels: [...source.schoolLevels],
            academicYear: source.academicYear,
            effectiveFrom: source.effectiveFrom,
            ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
            sha256: source.sha256,
          })),
          data: {
            bundleManifestSha256: services.bundle.bundleManifestSha256,
            bundleContentSha256: services.bundle.bundleContentSha256,
            files: services.bundle.bundleManifest.files.map((file) => ({ ...file })),
          },
        });
        return success({ ...output }, formatRulePackInfo(output));
      } catch (error) {
        return handleExpectedError(error);
      }
    },
  };
}

export type ToolHandlers = ReturnType<typeof createHandlers>;

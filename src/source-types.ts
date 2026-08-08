import { isAbsolute, normalize, sep } from "node:path";
import { z } from "zod";

export type SourceRole =
  | "primary-guide"
  | "directive-body"
  | "verification-copy"
  | "directive-appendix";
export type SourceFormat = "pdf" | "text" | "hwpml" | "hwp5";
export type AuthorityLevel = 100 | 80;
export type SchoolLevel = "elementary" | "middle" | "high";

export interface SourceDocument {
  id: string;
  title: string;
  role: SourceRole;
  format: SourceFormat;
  authority: AuthorityLevel;
  schoolLevels: SchoolLevel[];
  academicYear: 2026;
  effectiveFrom: "2026-03-01";
  publishedAt?: string;
  fileName: string;
  relativeInputPath: string;
  snapshotName: string;
  sha256: string;
  sourceUrl?: string;
  minimumExtractedChars: number;
}

export interface SourceManifest {
  schemaVersion: 1;
  packId: "kr-moe-school-record-elementary-2026.1";
  sources: SourceDocument[];
}

const relativePathSchema = z.string().min(1).superRefine((value, context) => {
  const normalized = normalize(value);
  const pathParts = normalized.split(sep);
  if (isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || pathParts.includes("..")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Expected a safe relative path" });
  }
});

export const sourceDocumentSchema: z.ZodType<SourceDocument> = z
  .object({
    id: z.string().regex(/^[A-Z0-9-]+$/),
    title: z.string().min(1),
    role: z.enum(["primary-guide", "directive-body", "verification-copy", "directive-appendix"]),
    format: z.enum(["pdf", "text", "hwpml", "hwp5"]),
    authority: z.union([z.literal(100), z.literal(80)]),
    schoolLevels: z.array(z.enum(["elementary", "middle", "high"])).min(1),
    academicYear: z.literal(2026),
    effectiveFrom: z.literal("2026-03-01"),
    publishedAt: z.string().date().optional(),
    fileName: z.string().min(1),
    relativeInputPath: relativePathSchema,
    snapshotName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    sha256: z.string().regex(/^[A-F0-9]{64}$/),
    sourceUrl: z.string().url().optional(),
    minimumExtractedChars: z.number().int().positive(),
  })
  .strict();

export const sourceManifestSchema: z.ZodType<SourceManifest> = z
  .object({
    schemaVersion: z.literal(1),
    packId: z.literal("kr-moe-school-record-elementary-2026.1"),
    sources: z.array(sourceDocumentSchema).length(8),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = new Set<string>();
    const snapshots = new Set<string>();
    for (const [index, source] of manifest.sources.entries()) {
      if (!source.schoolLevels.includes("elementary")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every active source must apply to elementary school",
          path: ["sources", index, "schoolLevels"],
        });
      }
      if (ids.has(source.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate source id: ${source.id}`,
          path: ["sources", index, "id"],
        });
      }
      if (snapshots.has(source.snapshotName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate snapshot name: ${source.snapshotName}`,
          path: ["sources", index, "snapshotName"],
        });
      }
      ids.add(source.id);
      snapshots.add(source.snapshotName);
    }
  });

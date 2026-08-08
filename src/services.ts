import type { DataBundle } from "./data-types.ts";
import { createEvidenceService } from "./evidence.ts";
import type { Services } from "./handlers.ts";
import { createGuidanceSearch } from "./search.ts";
import { createValidator } from "./validator.ts";

export function createServices(bundle: DataBundle): Services {
  return {
    bundle,
    validator: createValidator(bundle),
    search: createGuidanceSearch(bundle),
    evidence: createEvidenceService(bundle),
  };
}


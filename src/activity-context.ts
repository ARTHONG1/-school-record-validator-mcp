import type { RuleMatch } from "./check-types.ts";

export interface ActivityContextInput {
  domestic?: boolean;
  organizers?: Array<{
    kind: "school" | "other_elementary_school" | "education_authority" | "external" | "unknown";
    name?: string;
  }>;
  schoolApproved?: boolean;
  inSchoolEducationPlan?: boolean;
}

export interface VolunteerContextInput {
  planType?: "school" | "individual" | "unknown";
  schoolApproved?: boolean;
  evidenceAvailable?: boolean;
  activityKind?:
    | "service"
    | "simple_donation"
    | "disciplinary_service"
    | "juvenile_social_service"
    | "education_activity_infringement_measure"
    | "unknown";
}

function finding(ruleId: string, outcome: RuleMatch["outcome"]): RuleMatch {
  return { ruleId, outcome };
}

export function validateActivityContext(value?: ActivityContextInput): RuleMatch[] {
  if (value?.domestic === false || value?.organizers?.some((organizer) => organizer.kind === "external")) {
    return [finding("FIELD-CREATIVE-ACTIVITY-SCOPE", "block")];
  }

  if (
    value?.domestic !== true ||
    !value.organizers ||
    value.organizers.length === 0 ||
    value.organizers.some((organizer) => organizer.kind === "unknown")
  ) {
    return [finding("FIELD-CREATIVE-ACTIVITY-SCOPE", "review")];
  }

  const kinds = value.organizers.map((organizer) => organizer.kind);
  if (kinds.every((kind) => kind === "school")) {
    return value.inSchoolEducationPlan === true
      ? []
      : [finding("FIELD-CREATIVE-ACTIVITY-SCOPE", "review")];
  }

  if (value.schoolApproved === true) {
    return [];
  }

  return [finding("FIELD-CREATIVE-ACTIVITY-SCOPE", "review")];
}

export function validateVolunteerContext(value?: VolunteerContextInput): RuleMatch[] {
  const activityKind = value?.activityKind;
  if (
    activityKind === "simple_donation" ||
    activityKind === "disciplinary_service" ||
    activityKind === "juvenile_social_service" ||
    activityKind === "education_activity_infringement_measure"
  ) {
    return [finding("FIELD-VOLUNTEER-ELIGIBILITY", "block")];
  }

  if (value?.planType === "individual" && value.schoolApproved === false) {
    return [finding("FIELD-VOLUNTEER-ELIGIBILITY", "block")];
  }

  if (
    !value ||
    value.planType === undefined ||
    value.planType === "unknown" ||
    value.evidenceAvailable !== true ||
    activityKind === undefined ||
    activityKind === "unknown"
  ) {
    return [finding("FIELD-VOLUNTEER-ELIGIBILITY", "review")];
  }

  if (value.planType === "school" && activityKind === "service") {
    return [];
  }

  if (value.planType === "individual" && value.schoolApproved === true && activityKind === "service") {
    return [];
  }

  return [finding("FIELD-VOLUNTEER-ELIGIBILITY", "review")];
}

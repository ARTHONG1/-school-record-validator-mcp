import type { FieldSpec, PhraseRule, ValidationProfile } from "./rule-types.ts";
import type { RuleMatch } from "./check-types.ts";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appliesToField(rule: PhraseRule, field: FieldSpec): boolean {
  return rule.appliesTo === "all" || rule.appliesTo.includes(field.key);
}

function isEnabled(rule: PhraseRule, profile: ValidationProfile): boolean {
  return rule.authorityClass === "official-policy" || profile === "official_plus_editorial";
}

function flagsForLiteral(caseInsensitive: boolean | undefined): string {
  return caseInsensitive ? "giu" : "gu";
}

export function scanPhraseRules(
  text: string,
  rules: PhraseRule[],
  profile: ValidationProfile,
  field: FieldSpec,
): RuleMatch[] {
  if (field.contentRuleMode === "none") {
    return [];
  }

  const matches: RuleMatch[] = [];
  const seen = new Set<string>();

  for (const rule of rules) {
    if (!isEnabled(rule, profile) || !appliesToField(rule, field)) {
      continue;
    }

    for (const pattern of rule.detector.patterns) {
      const expression =
        rule.detector.type === "literal-any"
          ? new RegExp(escapeRegExp(pattern), flagsForLiteral(rule.detector.caseInsensitive))
          : new RegExp(pattern, "giu");

      for (const match of text.matchAll(expression)) {
        const matchedText = match[0];
        if (matchedText.length === 0) {
          continue;
        }

        const start = match.index ?? 0;
        const end = start + matchedText.length;
        const key = `${rule.id}\u0000${start}\u0000${end}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        matches.push({ ruleId: rule.id, outcome: rule.outcome, matchedText, start, end });
      }
    }
  }

  return matches;
}

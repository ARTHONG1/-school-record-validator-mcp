export function normalizeComparableText(input: string): string {
  return input.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function hasSameComparableText(left: string, right: string): boolean {
  return normalizeComparableText(left) === normalizeComparableText(right);
}

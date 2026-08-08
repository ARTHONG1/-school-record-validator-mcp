import type { SourceLocator } from "./corpus-types.ts";
import type { DataBundle } from "./data-types.ts";
import type { AuthorityLevel, SourceRole } from "./source-types.ts";

export interface GuidanceSearchOptions {
  limit?: number;
  sourceIds?: string[];
  sourceRoles?: SourceRole[];
}

export interface SearchResult {
  chunkId: string;
  sourceId: string;
  title: string;
  authority: AuthorityLevel;
  sourceSha256: string;
  locator: SourceLocator;
  locatorLabel: string;
  snippet: string;
  score: number;
  textSha256: string;
}

export interface GuidanceSearch {
  searchGuidance(query: string, options?: GuidanceSearchOptions): SearchResult[];
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .toLocaleLowerCase("ko-KR")
    .trim();
}

function tokens(value: string): string[] {
  const words = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  const joined = words.slice(0, -1).map((word, index) => `${word}${words[index + 1]}`);
  return [...new Set([...words, ...joined])];
}

function countNonOverlapping(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    count += 1;
    from = index + needle.length;
  }
  return count;
}

function locatorKey(locator: SourceLocator): string {
  switch (locator.kind) {
    case "pdf-page":
      return `P:${String(locator.pdfPage).padStart(6, "0")}`;
    case "article":
      return `A:${locator.article}:${locator.paragraph ?? ""}`;
    case "appendix":
      return `X:${String(locator.appendix).padStart(2, "0")}:${String(locator.unitIndex).padStart(6, "0")}`;
  }
}

function codePointSnippet(text: string, normalizedQuery: string, queryTokens: string[]): string {
  const normalizedText = normalize(text);
  const firstMatches = [normalizedText.indexOf(normalizedQuery), ...queryTokens.map((token) => normalizedText.indexOf(token))]
    .filter((index) => index >= 0);
  const matchIndex = firstMatches.length === 0 ? 0 : Math.min(...firstMatches);

  // The normalized text can differ in UTF-16 width after NFKC. Searching the
  // original with the first token preserves useful context for ordinary text.
  const originalLower = text.toLocaleLowerCase("ko-KR");
  const originalIndex = queryTokens
    .map((token) => originalLower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? matchIndex;
  const points = Array.from(text);
  const prefixPoints = Array.from(text.slice(0, originalIndex)).length;
  const start = Math.max(0, prefixPoints - 120);
  const end = Math.min(points.length, prefixPoints + 120);
  return `${start > 0 ? "…" : ""}${points.slice(start, end).join("")}${end < points.length ? "…" : ""}`;
}

export function createGuidanceSearch(bundle: DataBundle): GuidanceSearch {
  const knownSourceIds = new Set(bundle.sourceById.keys());
  const knownSourceRoles = new Set<SourceRole>([
    "primary-guide",
    "directive-body",
    "verification-copy",
    "directive-appendix",
  ]);
  const corpusSize = bundle.activeChunks.length;
  const documentFrequency = new Map<string, number>();
  const chunkLengthById = new Map<string, number>();
  let totalChunkLength = 0;
  for (const chunk of bundle.activeChunks) {
    const chunkTokens = new Set(tokens(normalize(chunk.searchText)));
    chunkLengthById.set(chunk.id, chunkTokens.size);
    totalChunkLength += chunkTokens.size;
    for (const token of chunkTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  const averageChunkLength = totalChunkLength / Math.max(1, corpusSize);

  return {
    searchGuidance(query, options = {}) {
      const normalizedQuery = normalize(query);
      if (normalizedQuery.length < 1 || Array.from(normalizedQuery).length > 200) {
        throw new Error("query must contain between 1 and 200 characters");
      }

      const limit = options.limit ?? 5;
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        throw new Error("limit must be an integer from 1 to 20");
      }

      const requestedSources = options.sourceIds;
      if (requestedSources?.some((sourceId) => !knownSourceIds.has(sourceId))) {
        throw new Error("sourceIds contains an unknown source ID");
      }
      const sourceFilter = requestedSources ? new Set(requestedSources) : undefined;
      const requestedRoles = options.sourceRoles;
      if (requestedRoles?.some((role) => !knownSourceRoles.has(role))) {
        throw new Error("sourceRoles contains an unknown source role");
      }
      const roleFilter = requestedRoles ? new Set(requestedRoles) : undefined;
      const queryTokens = tokens(normalizedQuery);

      return bundle.activeChunks
        .filter((chunk) => !sourceFilter || sourceFilter.has(chunk.sourceId))
        .map((chunk) => {
          const source = bundle.sourceById.get(chunk.sourceId);
          if (!source) throw new Error(`Missing source metadata for ${chunk.sourceId}`);
          if (roleFilter && !roleFilter.has(source.role)) return undefined;

          const searchText = normalize(chunk.searchText);
          const headingText = normalize(chunk.headingPath.join(" "));
          const exactPhraseCount = countNonOverlapping(searchText, normalizedQuery);
          const compactSearchText = searchText.replace(/\s+/gu, "");
          const compactQuery = normalizedQuery.replace(/\s+/gu, "");
          const compactPhraseCount = countNonOverlapping(compactSearchText, compactQuery);
          const candidateTokens = tokens(searchText);
          const chunkLength = chunkLengthById.get(chunk.id) ?? candidateTokens.length;
          let bm25 = 0;
          let matchedDistinctTokenCount = 0;
          for (const token of queryTokens) {
            const termFrequency = countNonOverlapping(searchText, token);
            if (termFrequency === 0) continue;
            matchedDistinctTokenCount += 1;
            const documentCount = documentFrequency.get(token) ?? 0;
            const idf = Math.log(1 + (corpusSize - documentCount + 0.5) / (documentCount + 0.5));
            const normalizedTf = (termFrequency * 2.2) /
              (termFrequency + 1.2 * (0.25 + 0.75 * chunkLength / Math.max(1, averageChunkLength)));
            bm25 += idf * normalizedTf;
          }
          const coverage = matchedDistinctTokenCount / Math.max(1, queryTokens.length);
          const headingTokenCount = queryTokens.filter((token) => headingText.includes(token)).length;
          const headingCoverage = headingTokenCount / Math.max(1, queryTokens.length);
          const score = exactPhraseCount * 3000
            + compactPhraseCount * 1800
            + coverage * 800
            + headingCoverage * 500
            + bm25 * 100
            + (compactSearchText.includes(compactQuery) ? 400 : 0)
            + chunk.authority * 0.01;

          return {
            chunk,
            source,
            score,
            matched: exactPhraseCount > 0 || matchedDistinctTokenCount > 0,
          };
        })
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
        .filter((candidate) => candidate.matched)
        .sort((left, right) =>
          right.score - left.score
          || right.chunk.authority - left.chunk.authority
          || left.chunk.sourceId.localeCompare(right.chunk.sourceId, "en")
          || locatorKey(left.chunk.locator).localeCompare(locatorKey(right.chunk.locator), "en"))
        .slice(0, limit)
        .map(({ chunk, source, score }) => ({
          chunkId: chunk.id,
          sourceId: chunk.sourceId,
          title: source.title,
          authority: chunk.authority,
          sourceSha256: source.sha256,
          locator: chunk.locator,
          locatorLabel: chunk.locatorLabel,
          snippet: codePointSnippet(chunk.text, normalizedQuery, queryTokens),
          score,
          textSha256: chunk.textSha256,
        }));
    },
  };
}

export function normalizeCorpusText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .toLocaleLowerCase("ko-KR")
    .trim();
}

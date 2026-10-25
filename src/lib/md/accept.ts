const Q_PARAM = /^q=(?<q>[\d.]+)$/u;

interface MediaRange {
  type: string;
  q: number;
}

const parseAccept = (accept: string): MediaRange[] =>
  accept.split(",").map((part) => {
    const [type = "", ...params] = part
      .split(";")
      .map((piece) => piece.trim().toLowerCase());
    const qValue = params
      .map((param) => Q_PARAM.exec(param)?.groups?.q)
      .find(Boolean);
    return { type, q: qValue === undefined ? 1 : Number(qValue) };
  });

/** q of the most specific range matching text/html (exact, then text/*, then wildcard). */
const htmlQuality = (ranges: MediaRange[]): number => {
  for (const type of ["text/html", "text/*", "*/*"]) {
    const match = ranges.find((range) => range.type === type);
    if (match) {
      return match.q;
    }
  }
  return 0;
};

/**
 * Content negotiation for page URLs: true only when the client ranks
 * text/markdown strictly above text/html. Wildcards never select markdown,
 * so browsers, curl and link unfurlers keep getting HTML.
 */
export const prefersMarkdown = (accept: string | null): boolean => {
  if (accept === null || accept === "") {
    return false;
  }
  const ranges = parseAccept(accept);
  const markdownQ =
    ranges.find((range) => range.type === "text/markdown")?.q ?? 0;
  return markdownQ > 0 && markdownQ > htmlQuality(ranges);
};

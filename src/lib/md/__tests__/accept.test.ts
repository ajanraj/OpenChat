import { describe, expect, it } from "vitest";

import { prefersMarkdown } from "../accept";

describe(prefersMarkdown, () => {
  it.each([
    ["text/markdown", true],
    ["text/markdown, text/html;q=0.9", true],
    ["text/html;q=0.5, text/markdown;q=0.8", true],
    ["TEXT/Markdown; charset=utf-8", true],
  ])("serves markdown for %s", (accept, expected) => {
    expect(prefersMarkdown(accept)).toBe(expected);
  });

  it.each([
    [null],
    [""],
    ["*/*"],
    ["text/*"],
    ["text/markdown, text/html"],
    ["text/markdown;q=0.5, text/html"],
    ["text/markdown;q=0.5, */*"],
    ["text/markdown;q=0"],
    [
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    ],
  ])("serves HTML for %s", (accept) => {
    expect(prefersMarkdown(accept)).toBeFalsy();
  });
});

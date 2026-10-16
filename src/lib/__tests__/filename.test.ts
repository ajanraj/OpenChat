import { describe, expect, it } from "vitest";

import {
  __filenameUtilsTesting__,
  sanitizeAndValidateFileName,
} from "@/lib/filename";

describe(sanitizeAndValidateFileName, () => {
  it("returns default for empty or whitespace-only names", () => {
    expect(sanitizeAndValidateFileName("")).toBe("file");
    expect(sanitizeAndValidateFileName("   ")).toBe("file");
  });

  it("replaces reserved punctuation with underscores and collapses whitespace", () => {
    const input = 'my  *illegal*  name<>:"/\\|?*.pdf';
    const out = sanitizeAndValidateFileName(input);
    expect(out).toBe("my _illegal_ name_________.pdf");
  });

  it("removes control characters", () => {
    const input = "bad\u0000name\nfile.txt";
    const out = sanitizeAndValidateFileName(input);
    expect(out).toBe("badnamefile.txt");
  });

  it("disallows names that are just dots", () => {
    expect(sanitizeAndValidateFileName("....")).toBe("file");
    expect(sanitizeAndValidateFileName("..")).toBe("file");
  });

  it("trims trailing dots/spaces from base and preserves extension", () => {
    expect(sanitizeAndValidateFileName("name. ")).toBe("name");
    expect(sanitizeAndValidateFileName("hello .pdf")).toBe("hello.pdf");
  });

  it("preserves leading dot for dotfiles", () => {
    expect(sanitizeAndValidateFileName(".env")).toBe(".env");
  });

  it.each([
    // Basic reserved names
    ["con", "con-file"],
    ["PRN", "PRN-file"],
    ["Com1", "Com1-file"],
    // Reserved names with trailing dots (should append -file and strip dots)
    ["con.", "con-file"],
    ["con...", "con-file"],
    ["PRN.", "PRN-file"],
    ["aux.", "aux-file"],
    ["nul.", "nul-file"],
    ["lpt1.", "lpt1-file"],
    // Reserved names with trailing spaces (should append -file and strip spaces)
    ["con ", "con-file"],
    ["PRN   ", "PRN-file"],
    ["aux ", "aux-file"],
    ["com2 ", "com2-file"],
    // Reserved names with trailing dots/spaces and extensions
    ["PRN .txt", "PRN-file.txt"],
    ["con..txt", "con-file.txt"],
    ["aux .pdf", "aux-file.pdf"],
    ["nul. .doc", "nul-file.doc"],
    ["lpt2 .  .log", "lpt2-file.log"],
  ])("avoids reserved basename %j by appending -file", (input, expected) => {
    expect(sanitizeAndValidateFileName(input)).toBe(expected);
  });

  it("preserves extension and enforces max length", () => {
    const { MAX_FILENAME_LENGTH } = __filenameUtilsTesting__;
    const longBase = "a".repeat(MAX_FILENAME_LENGTH + 50);
    const out = sanitizeAndValidateFileName(`${longBase}.pdf`);
    expect(out.endsWith(".pdf")).toBeTruthy();
    expect(out).toHaveLength(MAX_FILENAME_LENGTH);
  });

  it("normalizes unicode (NFKC)", () => {
    // Full-width Latin chars should normalize to ASCII
    const out = sanitizeAndValidateFileName("ＡＢＣ１２３.txt");
    // Some environments may not normalize numerals the same; just assert reasonable outcome
    expect(out.toLowerCase()).toBe("abc123.txt");
  });
});

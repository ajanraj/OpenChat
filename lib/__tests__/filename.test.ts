import { describe, expect, it } from "vitest";
import {
  __filenameUtilsTesting__,
  sanitizeAndValidateFileName,
} from "@/lib/filename";

describe("sanitizeAndValidateFileName", () => {
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

  it("avoids reserved basenames by appending -file", () => {
    // Basic reserved names
    expect(sanitizeAndValidateFileName("con")).toBe("con-file");
    expect(sanitizeAndValidateFileName("PRN")).toBe("PRN-file");
    expect(sanitizeAndValidateFileName("Com1")).toBe("Com1-file");

    // Reserved names with trailing dots (should append -file and strip dots)
    expect(sanitizeAndValidateFileName("con.")).toBe("con-file");
    expect(sanitizeAndValidateFileName("con...")).toBe("con-file");
    expect(sanitizeAndValidateFileName("PRN.")).toBe("PRN-file");
    expect(sanitizeAndValidateFileName("aux.")).toBe("aux-file");
    expect(sanitizeAndValidateFileName("nul.")).toBe("nul-file");
    expect(sanitizeAndValidateFileName("lpt1.")).toBe("lpt1-file");

    // Reserved names with trailing spaces (should append -file and strip spaces)
    expect(sanitizeAndValidateFileName("con ")).toBe("con-file");
    expect(sanitizeAndValidateFileName("PRN   ")).toBe("PRN-file");
    expect(sanitizeAndValidateFileName("aux ")).toBe("aux-file");
    expect(sanitizeAndValidateFileName("com2 ")).toBe("com2-file");

    // Reserved names with trailing dots/spaces and extensions
    expect(sanitizeAndValidateFileName("PRN .txt")).toBe("PRN-file.txt");
    expect(sanitizeAndValidateFileName("con..txt")).toBe("con-file.txt");
    expect(sanitizeAndValidateFileName("aux .pdf")).toBe("aux-file.pdf");
    expect(sanitizeAndValidateFileName("nul. .doc")).toBe("nul-file.doc");
    expect(sanitizeAndValidateFileName("lpt2 .  .log")).toBe("lpt2-file.log");
  });

  it("preserves extension and enforces max length", () => {
    const { MAX_FILENAME_LENGTH } = __filenameUtilsTesting__;
    const longBase = "a".repeat(MAX_FILENAME_LENGTH + 50);
    const out = sanitizeAndValidateFileName(`${longBase}.pdf`);
    expect(out.endsWith(".pdf")).toBe(true);
    expect(out.length).toBe(MAX_FILENAME_LENGTH);
  });

  it("normalizes unicode (NFKC)", () => {
    // Full-width Latin chars should normalize to ASCII
    const out = sanitizeAndValidateFileName("ＡＢＣ１２３.txt");
    // Some environments may not normalize numerals the same; just assert reasonable outcome
    expect(out.toLowerCase()).toBe("abc123.txt");
  });
});

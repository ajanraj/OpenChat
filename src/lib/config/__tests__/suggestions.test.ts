import { describe, expect, it } from "vitest";

import { SUGGESTIONS } from "../suggestions";

describe("Suggestions Config", () => {
  describe("SUGGESTIONS array", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(SUGGESTIONS)).toBe(true);
      expect(SUGGESTIONS.length).toBeGreaterThan(0);
    });

    it("each suggestion has required properties", () => {
      for (const suggestion of SUGGESTIONS) {
        expect(suggestion.label).toBeDefined();
        expect(typeof suggestion.label).toBe("string");
        expect(suggestion.label.length).toBeGreaterThan(0);

        expect(suggestion.highlight).toBeDefined();
        expect(typeof suggestion.highlight).toBe("string");

        expect(suggestion.prompt).toBeDefined();
        expect(typeof suggestion.prompt).toBe("string");

        expect(suggestion.icon).toBeDefined();
      }
    });

    it("each suggestion has items array", () => {
      for (const suggestion of SUGGESTIONS) {
        expect(Array.isArray(suggestion.items)).toBe(true);
        expect(suggestion.items.length).toBeGreaterThan(0);
      }
    });

    it("all items are non-empty strings", () => {
      for (const suggestion of SUGGESTIONS) {
        for (const item of suggestion.items) {
          expect(typeof item).toBe("string");
          expect(item.length).toBeGreaterThan(0);
        }
      }
    });

    it("items start with the prompt/highlight text", () => {
      for (const suggestion of SUGGESTIONS) {
        for (const item of suggestion.items) {
          const startsWithPrompt = item.startsWith(suggestion.prompt);
          const startsWithHighlight = item.startsWith(suggestion.highlight);
          expect(startsWithPrompt || startsWithHighlight).toBe(true);
        }
      }
    });
  });

  describe("Suggestion categories", () => {
    it("includes Summary category", () => {
      const summary = SUGGESTIONS.find((s) => s.label === "Summary");
      expect(summary).toBeDefined();
    });

    it("includes Code category", () => {
      const code = SUGGESTIONS.find((s) => s.label === "Code");
      expect(code).toBeDefined();
    });

    it("includes Design category", () => {
      const design = SUGGESTIONS.find((s) => s.label === "Design");
      expect(design).toBeDefined();
    });

    it("includes Research category", () => {
      const research = SUGGESTIONS.find((s) => s.label === "Research");
      expect(research).toBeDefined();
    });
  });
});

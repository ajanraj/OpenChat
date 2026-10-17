import { describe, expect, it } from "vitest";

import { SUGGESTIONS } from "../suggestions";

describe("Suggestions Config", () => {
  describe("SUGGESTIONS array", () => {
    it("is a non-empty array", () => {
      expect(Array.isArray(SUGGESTIONS)).toBeTruthy();
      expect(SUGGESTIONS.length).toBeGreaterThan(0);
    });

    it("each suggestion has a non-empty label", () => {
      for (const suggestion of SUGGESTIONS) {
        expect(suggestion.label).toBeDefined();
        expect(suggestion.label).toBeTypeOf("string");
        expect(suggestion.label.length).toBeGreaterThan(0);
      }
    });

    it("each suggestion has highlight and prompt strings", () => {
      for (const suggestion of SUGGESTIONS) {
        expect(suggestion.highlight).toBeDefined();
        expect(suggestion.highlight).toBeTypeOf("string");
        expect(suggestion.prompt).toBeDefined();
        expect(suggestion.prompt).toBeTypeOf("string");
      }
    });

    it("each suggestion has an icon", () => {
      for (const suggestion of SUGGESTIONS) {
        expect(suggestion.icon).toBeDefined();
      }
    });

    it("each suggestion has items array", () => {
      for (const suggestion of SUGGESTIONS) {
        expect(Array.isArray(suggestion.items)).toBeTruthy();
        expect(suggestion.items.length).toBeGreaterThan(0);
      }
    });

    it("all items are non-empty strings", () => {
      for (const suggestion of SUGGESTIONS) {
        for (const item of suggestion.items) {
          expect(item).toBeTypeOf("string");
          expect(item.length).toBeGreaterThan(0);
        }
      }
    });

    it("items start with the prompt/highlight text", () => {
      for (const suggestion of SUGGESTIONS) {
        for (const item of suggestion.items) {
          const startsWithPrompt = item.startsWith(suggestion.prompt);
          const startsWithHighlight = item.startsWith(suggestion.highlight);
          expect(startsWithPrompt || startsWithHighlight).toBeTruthy();
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

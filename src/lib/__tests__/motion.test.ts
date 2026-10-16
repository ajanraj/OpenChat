import { describe, expect, it } from "vitest";

import { TRANSITION_LAYOUT, TRANSITION_SUGGESTIONS } from "../motion";

describe("Motion Transitions", () => {
  describe("TRANSITION_SUGGESTIONS constant", () => {
    it("has duration property", () => {
      expect(TRANSITION_SUGGESTIONS.duration).toBeDefined();
      expect(TRANSITION_SUGGESTIONS.duration).toBeTypeOf("number");
    });

    it("has ease property", () => {
      expect(TRANSITION_SUGGESTIONS.ease).toBeDefined();
    });

    it("duration is a positive number", () => {
      expect(TRANSITION_SUGGESTIONS.duration).toBeGreaterThan(0);
    });
  });

  describe("TRANSITION_LAYOUT constant", () => {
    it("has duration property", () => {
      expect(TRANSITION_LAYOUT.duration).toBeDefined();
      expect(TRANSITION_LAYOUT.duration).toBeTypeOf("number");
    });

    it("has ease property", () => {
      expect(TRANSITION_LAYOUT.ease).toBeDefined();
    });

    it("duration is a positive number", () => {
      expect(TRANSITION_LAYOUT.duration).toBeGreaterThan(0);
    });
  });

  describe("Consistency", () => {
    it("both transitions have same duration", () => {
      expect(TRANSITION_SUGGESTIONS.duration).toBe(TRANSITION_LAYOUT.duration);
    });

    it("both transitions have same ease", () => {
      expect(TRANSITION_SUGGESTIONS.ease).toBe(TRANSITION_LAYOUT.ease);
    });
  });
});

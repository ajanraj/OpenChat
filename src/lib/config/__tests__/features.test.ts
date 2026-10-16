import { describe, expect, it } from "vitest";

import {
  FILE_UPLOAD_FEATURE,
  IMAGE_GENERATION_FEATURE,
  PDF_PROCESSING_FEATURE,
  REASONING_FEATURE,
  REASONING_FEATURE_ALWAYS,
  REASONING_FEATURE_MAX,
  REASONING_FEATURE_BASIC,
  REASONING_FEATURE_DISABLED,
  REASONING_FEATURE_FIXED,
  REASONING_FEATURE_TOGGLE,
  TOOL_CALLING_FEATURE,
} from "../features";

describe("Feature Constants", () => {
  describe("file upload feature", () => {
    it("has correct id", () => {
      expect(FILE_UPLOAD_FEATURE.id).toBe("file-upload");
    });

    it("is enabled by default", () => {
      expect(FILE_UPLOAD_FEATURE.enabled).toBeTruthy();
    });

    it("has a label", () => {
      expect(FILE_UPLOAD_FEATURE.label).toBeDefined();
      expect(FILE_UPLOAD_FEATURE.label).toBeTypeOf("string");
    });
  });

  describe("PDF processing feature", () => {
    it("has correct id", () => {
      expect(PDF_PROCESSING_FEATURE.id).toBe("pdf-processing");
    });

    it("is enabled by default", () => {
      expect(PDF_PROCESSING_FEATURE.enabled).toBeTruthy();
    });

    it("has a label", () => {
      expect(PDF_PROCESSING_FEATURE.label).toBeDefined();
    });
  });

  describe("REASONING_FEATURE variants", () => {
    it("REASONING_FEATURE supports optional reasoning effort", () => {
      expect(REASONING_FEATURE.id).toBe("reasoning");
      expect(REASONING_FEATURE.enabled).toBeTruthy();
      expect(REASONING_FEATURE.effortOptions).toStrictEqual([
        "none",
        "low",
        "medium",
        "high",
      ]);
    });

    it("defines always-on and toggle effort options", () => {
      expect(REASONING_FEATURE_ALWAYS.effortOptions).toStrictEqual([
        "low",
        "medium",
        "high",
      ]);
      expect(REASONING_FEATURE_MAX.effortOptions).toStrictEqual([
        "xhigh",
        "high",
        "low",
      ]);
      expect(REASONING_FEATURE_TOGGLE.effortOptions).toStrictEqual([
        "none",
        "high",
      ]);
    });

    it("keeps basic reasoning compatible with fixed reasoning", () => {
      expect(REASONING_FEATURE_BASIC).toBe(REASONING_FEATURE_FIXED);
      expect(REASONING_FEATURE_FIXED).not.toHaveProperty("effortOptions");
    });

    it("REASONING_FEATURE_DISABLED has correct id and is disabled", () => {
      expect(REASONING_FEATURE_DISABLED.id).toBe("reasoning");
      expect(REASONING_FEATURE_DISABLED.enabled).toBeFalsy();
    });

    it("all reasoning features share same id", () => {
      expect(REASONING_FEATURE.id).toBe(REASONING_FEATURE_BASIC.id);
      expect(REASONING_FEATURE.id).toBe(REASONING_FEATURE_DISABLED.id);
    });
  });

  describe("image generation feature", () => {
    it("has correct id", () => {
      expect(IMAGE_GENERATION_FEATURE.id).toBe("image-generation");
    });

    it("is enabled by default", () => {
      expect(IMAGE_GENERATION_FEATURE.enabled).toBeTruthy();
    });

    it("has a label", () => {
      expect(IMAGE_GENERATION_FEATURE.label).toBeDefined();
    });
  });

  describe("tool calling feature", () => {
    it("has correct id", () => {
      expect(TOOL_CALLING_FEATURE.id).toBe("tool-calling");
    });

    it("is enabled by default", () => {
      expect(TOOL_CALLING_FEATURE.enabled).toBeTruthy();
    });

    it("has a label mentioning tools", () => {
      expect(TOOL_CALLING_FEATURE.label).toBeDefined();
      expect(TOOL_CALLING_FEATURE.label.toLowerCase()).toContain("tool");
    });
  });
});

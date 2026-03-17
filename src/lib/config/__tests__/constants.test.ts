import { describe, expect, it } from "vitest";
import {
  APP_BASE_URL,
  APP_DESCRIPTION,
  APP_DOMAIN,
  APP_NAME,
  DAILY_FILE_UPLOAD_LIMIT,
  GITHUB_REPO_URL,
  MESSAGE_MAX_LENGTH,
  META_TITLE,
  MODEL_DEFAULT,
  PREMIUM_CREDITS,
  RECOMMENDED_MODELS,
  REMAINING_QUERY_ALERT_THRESHOLD,
} from "../constants";

const URL_PATTERN = /^https?:\/\//;
const GITHUB_URL_PATTERN = /^https:\/\/github\.com\//;

describe("App Constants", () => {
  describe("Credits and Limits", () => {
    it("PREMIUM_CREDITS is a positive number", () => {
      expect(PREMIUM_CREDITS).toBeGreaterThan(0);
      expect(Number.isInteger(PREMIUM_CREDITS)).toBe(true);
    });

    it("REMAINING_QUERY_ALERT_THRESHOLD is a positive number", () => {
      expect(REMAINING_QUERY_ALERT_THRESHOLD).toBeGreaterThan(0);
      expect(Number.isInteger(REMAINING_QUERY_ALERT_THRESHOLD)).toBe(true);
    });

    it("DAILY_FILE_UPLOAD_LIMIT is a positive number", () => {
      expect(DAILY_FILE_UPLOAD_LIMIT).toBeGreaterThan(0);
      expect(Number.isInteger(DAILY_FILE_UPLOAD_LIMIT)).toBe(true);
    });

    it("MESSAGE_MAX_LENGTH is a positive number", () => {
      expect(MESSAGE_MAX_LENGTH).toBeGreaterThan(0);
      expect(Number.isInteger(MESSAGE_MAX_LENGTH)).toBe(true);
    });
  });

  describe("App Branding", () => {
    it("APP_NAME is defined", () => {
      expect(APP_NAME).toBeDefined();
      expect(typeof APP_NAME).toBe("string");
      expect(APP_NAME.length).toBeGreaterThan(0);
    });

    it("META_TITLE includes APP_NAME", () => {
      expect(META_TITLE).toContain(APP_NAME);
    });

    it("APP_DOMAIN is a valid URL", () => {
      expect(APP_DOMAIN).toMatch(URL_PATTERN);
    });

    it("APP_DESCRIPTION is defined and not empty", () => {
      expect(APP_DESCRIPTION).toBeDefined();
      expect(typeof APP_DESCRIPTION).toBe("string");
      expect(APP_DESCRIPTION.length).toBeGreaterThan(0);
    });

    it("APP_BASE_URL is defined", () => {
      expect(APP_BASE_URL).toBeDefined();
      expect(typeof APP_BASE_URL).toBe("string");
    });

    it("GITHUB_REPO_URL is a valid GitHub URL", () => {
      expect(GITHUB_REPO_URL).toMatch(GITHUB_URL_PATTERN);
    });
  });

  describe("Model Configuration", () => {
    it("MODEL_DEFAULT is a non-empty string", () => {
      expect(MODEL_DEFAULT).toBeDefined();
      expect(typeof MODEL_DEFAULT).toBe("string");
      expect(MODEL_DEFAULT.length).toBeGreaterThan(0);
      expect(MODEL_DEFAULT).toBe("gpt-5.4-nano");
    });

    it("RECOMMENDED_MODELS is a non-empty array", () => {
      expect(Array.isArray(RECOMMENDED_MODELS)).toBe(true);
      expect(RECOMMENDED_MODELS.length).toBeGreaterThan(0);
    });

    it("RECOMMENDED_MODELS contains only strings", () => {
      for (const model of RECOMMENDED_MODELS) {
        expect(typeof model).toBe("string");
      }
    });

    it("prefers GPT-5.4 mini/nano in the curated recommendations", () => {
      expect(RECOMMENDED_MODELS).toContain("gpt-5.4-mini");
      expect(RECOMMENDED_MODELS).toContain("gpt-5.4-nano");
      expect(RECOMMENDED_MODELS).not.toContain("gpt-5-mini");
      expect(RECOMMENDED_MODELS).not.toContain("gpt-5-nano");
    });
  });
});

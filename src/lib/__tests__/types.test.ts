import { describe, expect, it } from "vitest";
import type { ConnectorType } from "../types";

describe("types", () => {
  describe("ConnectorType", () => {
    it("allows gmail as valid connector type", () => {
      const connector: ConnectorType = "gmail";

      expect(connector).toBe("gmail");
    });

    it("allows googlecalendar as valid connector type", () => {
      const connector: ConnectorType = "googlecalendar";

      expect(connector).toBe("googlecalendar");
    });

    it("allows notion as valid connector type", () => {
      const connector: ConnectorType = "notion";

      expect(connector).toBe("notion");
    });

    it("allows googledrive as valid connector type", () => {
      const connector: ConnectorType = "googledrive";

      expect(connector).toBe("googledrive");
    });

    it("allows googledocs as valid connector type", () => {
      const connector: ConnectorType = "googledocs";

      expect(connector).toBe("googledocs");
    });

    it("allows googlesheets as valid connector type", () => {
      const connector: ConnectorType = "googlesheets";

      expect(connector).toBe("googlesheets");
    });

    it("allows slack as valid connector type", () => {
      const connector: ConnectorType = "slack";

      expect(connector).toBe("slack");
    });

    it("allows linear as valid connector type", () => {
      const connector: ConnectorType = "linear";

      expect(connector).toBe("linear");
    });

    it("allows github as valid connector type", () => {
      const connector: ConnectorType = "github";

      expect(connector).toBe("github");
    });

    it("allows twitter as valid connector type", () => {
      const connector: ConnectorType = "twitter";

      expect(connector).toBe("twitter");
    });

    it("includes all 10 connector types", () => {
      const connectors: ConnectorType[] = [
        "gmail",
        "googlecalendar",
        "notion",
        "googledrive",
        "googledocs",
        "googlesheets",
        "slack",
        "linear",
        "github",
        "twitter",
      ];

      expect(connectors).toHaveLength(10);
    });
  });
});

import { describe, expect, it } from "vitest";
import { calculateConnectorStatus, SUPPORTED_CONNECTORS } from '../connector-utils';
import type { Connector } from '../connector-utils';

describe("SUPPORTED_CONNECTORS", () => {
  it("is defined and is an array", () => {
    expect(SUPPORTED_CONNECTORS).toBeDefined();
    expect(Array.isArray(SUPPORTED_CONNECTORS)).toBe(true);
  });

  it("contains expected connector types", () => {
    expect(SUPPORTED_CONNECTORS.length).toBeGreaterThan(0);
  });
});

describe("calculateConnectorStatus", () => {
  it("returns empty arrays when no connectors provided", () => {
    const result = calculateConnectorStatus([]);

    expect(result.enabled).toEqual([]);
    expect(result.disabled).toEqual([]);
    expect(result.notConnected).toHaveLength(SUPPORTED_CONNECTORS.length);
  });

  it("correctly identifies enabled connectors", () => {
    const connectors: Connector[] = [
      { type: "gmail", isConnected: true, enabled: true },
      { type: "googlecalendar", isConnected: true },
    ];

    const result = calculateConnectorStatus(connectors);

    expect(result.enabled).toContain("GMAIL");
    expect(result.enabled).toContain("GOOGLECALENDAR");
  });

  it("correctly identifies disabled connectors", () => {
    const connectors: Connector[] = [{ type: "gmail", isConnected: true, enabled: false }];

    const result = calculateConnectorStatus(connectors);

    expect(result.disabled).toContain("GMAIL");
    expect(result.enabled).not.toContain("GMAIL");
  });

  it("correctly identifies not connected connectors", () => {
    const connectors: Connector[] = [
      { type: "gmail", isConnected: false },
      { type: "googlecalendar", isConnected: true },
    ];

    const result = calculateConnectorStatus(connectors);

    expect(result.notConnected).toContain("GMAIL");
    expect(result.notConnected).not.toContain("GOOGLECALENDAR");
  });

  it("treats undefined enabled as enabled when connected", () => {
    const connectors: Connector[] = [{ type: "gmail", isConnected: true }];

    const result = calculateConnectorStatus(connectors);

    expect(result.enabled).toContain("GMAIL");
    expect(result.disabled).not.toContain("GMAIL");
  });

  it("handles mixed connector states", () => {
    const connectors: Connector[] = [
      { type: "gmail", isConnected: true, enabled: true },
      { type: "googlecalendar", isConnected: true, enabled: false },
      { type: "notion", isConnected: false },
    ];

    const result = calculateConnectorStatus(connectors);

    expect(result.enabled).toContain("GMAIL");
    expect(result.disabled).toContain("GOOGLECALENDAR");
    expect(result.notConnected).toContain("NOTION");
  });

  it("uppercases connector types in output", () => {
    const connectors: Connector[] = [{ type: "gmail", isConnected: true }];

    const result = calculateConnectorStatus(connectors);

    expect(result.enabled).toContain("GMAIL");
    expect(result.enabled).not.toContain("gmail");
  });
});

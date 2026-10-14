import { getConvexSize, type Value } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  compactMessagePartsForStorage,
  MESSAGE_SIZE_BUDGET_BYTES,
  TOOL_PAYLOAD_PREVIEW_CHARS,
} from "../message-parts-storage";

type Part = Record<string, unknown>;

/** Tool output of roughly `kilobytes` KB, like a connector dump of many emails. */
function bigOutput(kilobytes: number) {
  return {
    items: Array.from({ length: kilobytes }, (_, id) => ({ id, body: "x".repeat(1000) })),
  };
}

function toolPart(output: unknown, input: unknown = { query: "inbox" }): Part {
  return {
    type: "dynamic-tool",
    toolName: "GMAIL_FETCH_EMAILS",
    toolCallId: "call_1",
    state: "output-available",
    input,
    output,
  };
}

const textPart: Part = { type: "text", text: "Here is your summary." };

describe("compactMessagePartsForStorage", () => {
  it("stores messages within the budget unchanged", () => {
    const parts = [textPart, toolPart({ results: [{ title: "a", url: "https://a.test" }] })];

    expect(compactMessagePartsForStorage(parts, "Here is your summary.")).toEqual(parts);
  });

  it("replaces an oversized tool output with a short preview", () => {
    const parts = [textPart, toolPart(bigOutput(1200))];

    const stored = compactMessagePartsForStorage(parts);

    expect(stored[0]).toEqual(textPart);
    expect(stored[1].input).toEqual({ query: "inbox" });
    expect(stored[1].output).toMatchObject({
      truncated: true,
      originalSize: getConvexSize(bigOutput(1200)),
    });
    const { preview } = stored[1].output as { preview: string };
    expect(preview.length).toBeLessThanOrEqual(TOOL_PAYLOAD_PREVIEW_CHARS);
    expect(preview.startsWith('{"items":[{"id":0')).toBe(true);
    expect(getConvexSize(stored as Value[])).toBeLessThan(MESSAGE_SIZE_BUDGET_BYTES);
  });

  it("compacts the largest payloads first and keeps the rest", () => {
    const parts = [toolPart(bigOutput(300)), toolPart(bigOutput(700))];

    const stored = compactMessagePartsForStorage(parts);

    expect(stored[0].output).toEqual(bigOutput(300));
    expect(stored[1].output).toMatchObject({ truncated: true });
  });

  it("counts the text content toward the budget", () => {
    const parts = [toolPart(bigOutput(500))];

    expect(compactMessagePartsForStorage(parts, "").at(0)?.output).toEqual(bigOutput(500));
    expect(compactMessagePartsForStorage(parts, "y".repeat(500_000)).at(0)?.output).toMatchObject({
      truncated: true,
    });
  });

  it.each([
    ["a reserved $ field name", { $schema: "https://json-schema.org", ok: true }],
    ["a non-ASCII field name", { Статус: "open" }],
  ])("replaces a small payload with %s, which Convex cannot store", (_label, input) => {
    const stored = compactMessagePartsForStorage([toolPart({ fine: true }, input)]);

    expect(stored[0].input).toMatchObject({ truncated: true, originalSize: 0 });
    expect((stored[0].input as { preview: string }).preview).toBe(JSON.stringify(input));
    expect(stored[0].output).toEqual({ fine: true });
  });

  it("leaves oversized text alone so the save still fails loudly", () => {
    const parts = [{ type: "text", text: "z".repeat(MESSAGE_SIZE_BUDGET_BYTES + 1) }];

    expect(compactMessagePartsForStorage(parts)).toEqual(parts);
  });

  it("does not modify the parts it was given", () => {
    const output = bigOutput(1200);
    const parts = [toolPart(output)];

    compactMessagePartsForStorage(parts);

    expect(parts[0].output).toBe(output);
  });
});

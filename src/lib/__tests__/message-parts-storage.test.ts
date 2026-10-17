import { getConvexSize } from "convex/values";
import type { Value } from "convex/values";
import { describe, expect, it } from "vitest";

import type { DepthLimitedValue } from "../depth-limiter";
import {
  compactMessagePartsForStorage,
  MESSAGE_SIZE_BUDGET_BYTES,
  TOOL_PAYLOAD_PREVIEW_CHARS,
} from "../message-parts-storage";

type Part = Record<string, Value>;

/** Tool output of roughly `kilobytes` KB, like a connector dump of many emails. */
const bigOutput = (kilobytes: number) => ({
  items: Array.from({ length: kilobytes }, (_, id) => ({
    id,
    body: "x".repeat(1000),
  })),
});

const DEFAULT_INPUT = { query: "inbox" };

const toolPart = (output: Value, input: Value = DEFAULT_INPUT): Part => ({
  type: "dynamic-tool",
  toolName: "GMAIL_FETCH_EMAILS",
  toolCallId: "call_1",
  state: "output-available",
  input,
  output,
});

type StoredPart = Record<string, DepthLimitedValue>;

/** The stored part at `index`, which must be a plain object. */
const partAt = (stored: DepthLimitedValue[], index: number): StoredPart => {
  const part = stored.at(index);
  if (
    typeof part !== "object" ||
    part === null ||
    Array.isArray(part) ||
    part instanceof Date
  ) {
    throw new TypeError(`Expected a stored part object at index ${index}`);
  }
  return part;
};

/** Narrows stored parts to a Convex value so their size can be measured. */
const isConvexValue = (value: unknown): value is Value => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return items.every(isConvexValue);
  }
  return (
    typeof value === "object" &&
    !(value instanceof Date) &&
    Object.values(value).every(isConvexValue)
  );
};

/** The preview of a compacted tool payload. */
const previewOf = (payload: DepthLimitedValue): string => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("preview" in payload) ||
    typeof payload.preview !== "string"
  ) {
    throw new TypeError("Expected a compacted tool payload");
  }
  return payload.preview;
};

const textPart: Part = { type: "text", text: "Here is your summary." };

describe(compactMessagePartsForStorage, () => {
  it("stores messages within the budget unchanged", () => {
    const parts = [
      textPart,
      toolPart({ results: [{ title: "a", url: "https://a.test" }] }),
    ];

    expect(
      compactMessagePartsForStorage(parts, "Here is your summary.")
    ).toStrictEqual(parts);
  });

  it("replaces an oversized tool output with a short preview", () => {
    const parts = [textPart, toolPart(bigOutput(1200))];

    const stored = compactMessagePartsForStorage(parts);

    expect(stored[0]).toStrictEqual(textPart);
    expect(partAt(stored, 1).input).toStrictEqual({ query: "inbox" });
    expect(partAt(stored, 1).output).toMatchObject({
      truncated: true,
      originalSize: getConvexSize(bigOutput(1200)),
    });
    const preview = previewOf(partAt(stored, 1).output);
    expect(preview.length).toBeLessThanOrEqual(TOOL_PAYLOAD_PREVIEW_CHARS);
    expect(preview.startsWith('{"items":[{"id":0')).toBeTruthy();
  });

  it("brings a message with an oversized tool output under the budget", () => {
    const stored = compactMessagePartsForStorage([
      textPart,
      toolPart(bigOutput(1200)),
    ]);

    if (!isConvexValue(stored)) {
      throw new TypeError("Expected the stored parts to be a Convex value");
    }
    expect(getConvexSize(stored)).toBeLessThan(MESSAGE_SIZE_BUDGET_BYTES);
  });

  it("compacts the largest payloads first and keeps the rest", () => {
    const parts = [toolPart(bigOutput(300)), toolPart(bigOutput(700))];

    const stored = compactMessagePartsForStorage(parts);

    expect(partAt(stored, 0).output).toStrictEqual(bigOutput(300));
    expect(partAt(stored, 1).output).toMatchObject({ truncated: true });
  });

  it("counts the text content toward the budget", () => {
    const parts = [toolPart(bigOutput(500))];

    expect(
      partAt(compactMessagePartsForStorage(parts, ""), 0).output
    ).toStrictEqual(bigOutput(500));
    expect(
      partAt(compactMessagePartsForStorage(parts, "y".repeat(500_000)), 0)
        .output
    ).toMatchObject({
      truncated: true,
    });
  });

  it.each([
    [
      "a reserved $ field name",
      { $schema: "https://json-schema.org", ok: true },
    ],
    ["a non-ASCII field name", { Статус: "open" }],
  ])(
    "replaces a small payload with %s, which Convex cannot store",
    (_label, input) => {
      const stored = compactMessagePartsForStorage([
        toolPart({ fine: true }, input),
      ]);

      expect(partAt(stored, 0).input).toMatchObject({
        truncated: true,
        originalSize: 0,
      });
      expect(previewOf(partAt(stored, 0).input)).toBe(JSON.stringify(input));
      expect(partAt(stored, 0).output).toStrictEqual({ fine: true });
    }
  );

  it("leaves oversized text alone so the save still fails loudly", () => {
    const parts = [
      { type: "text", text: "z".repeat(MESSAGE_SIZE_BUDGET_BYTES + 1) },
    ];

    expect(compactMessagePartsForStorage(parts)).toStrictEqual(parts);
  });

  it("does not modify the parts it was given", () => {
    const output = bigOutput(1200);
    const parts = [toolPart(output)];

    compactMessagePartsForStorage(parts);

    expect(parts[0].output).toBe(output);
  });
});

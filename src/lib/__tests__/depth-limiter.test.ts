import { describe, expect, it } from "vitest";

import { limitDepth } from "../depth-limiter";

const noop = () => {
  // Empty function for testing
};

describe(limitDepth, () => {
  it.each([null, undefined, "string", 123, true, false, 123n])(
    "returns the primitive %s unchanged",
    (value) => {
      expect(limitDepth(value)).toBe(value);
    }
  );

  it("replaces functions with [Function]", () => {
    expect(limitDepth(noop)).toBe("[Function]");
  });

  it("handles shallow objects", () => {
    const obj = { a: 1, b: "two", c: true };
    expect(limitDepth(obj)).toStrictEqual({ a: 1, b: "two", c: true });
  });

  it("handles shallow arrays", () => {
    const arr = [1, 2, 3];
    expect(limitDepth(arr)).toStrictEqual([1, 2, 3]);
  });

  it("handles nested objects within depth limit", () => {
    const obj = { a: { b: { c: 1 } } };
    expect(limitDepth(obj, 5)).toStrictEqual({ a: { b: { c: 1 } } });
  });

  it("truncates objects at max depth", () => {
    const deepObj = { level1: { level2: { level3: { level4: "deep" } } } };
    const result = limitDepth(deepObj, 2);
    expect(result).toStrictEqual({
      level1: {
        level2: { _truncated: true, _type: "object", _depth: 2 },
      },
    });
  });

  it("truncates arrays at max depth", () => {
    const deepArr = [[[["deep"]]]];
    const result = limitDepth(deepArr, 2);
    expect(result).toStrictEqual([
      [{ _truncated: true, _type: "array", _depth: 2 }],
    ]);
  });

  it("handles mixed nested structures", () => {
    const mixed = { arr: [{ nested: "value" }], obj: { arr: [1, 2] } };
    expect(limitDepth(mixed, 5)).toStrictEqual(mixed);
  });

  it("preserves Date objects", () => {
    const date = new Date("2024-12-25");
    // The same instance, not a copy, also when nested
    expect(limitDepth(date)).toBe(date);
    expect(limitDepth({ date })).toStrictEqual({ date });
  });

  it("uses default maxDepth of 14", () => {
    // Create an object with depth 15
    let deepObj: Record<string, unknown> = { value: "bottom" };
    for (let i = 0; i < 15; i += 1) {
      deepObj = { nested: deepObj };
    }
    const result = limitDepth(deepObj);
    // Should be truncated somewhere
    expect(JSON.stringify(result)).toContain("_truncated");
  });

  it("handles empty objects and arrays", () => {
    expect(limitDepth({})).toStrictEqual({});
    expect(limitDepth([])).toStrictEqual([]);
  });

  it("handles objects with symbol keys", () => {
    const sym = Symbol("test");
    // Symbol keys are not enumerable by Object.entries
    const obj = { regular: "value", [sym]: "symbol value" };
    const result = limitDepth(obj);
    expect(result).toStrictEqual({ regular: "value" });
  });
});

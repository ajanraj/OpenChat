import { describe, expect, it } from "vitest";
import { limitDepth } from "../depth-limiter";

describe("limitDepth", () => {
  it("returns primitives unchanged", () => {
    expect(limitDepth(null)).toBeNull();
    expect(limitDepth(undefined)).toBeUndefined();
    expect(limitDepth("string")).toBe("string");
    expect(limitDepth(123)).toBe(123);
    expect(limitDepth(true)).toBe(true);
    expect(limitDepth(false)).toBe(false);
    expect(limitDepth(123n)).toBe(123n);
  });

  it("replaces functions with [Function]", () => {
    const fn = () => {
      // Empty function for testing
    };
    expect(limitDepth(fn)).toBe("[Function]");
  });

  it("handles shallow objects", () => {
    const obj = { a: 1, b: "two", c: true };
    expect(limitDepth(obj)).toEqual({ a: 1, b: "two", c: true });
  });

  it("handles shallow arrays", () => {
    const arr = [1, 2, 3];
    expect(limitDepth(arr)).toEqual([1, 2, 3]);
  });

  it("handles nested objects within depth limit", () => {
    const obj = { a: { b: { c: 1 } } };
    expect(limitDepth(obj, 5)).toEqual({ a: { b: { c: 1 } } });
  });

  it("truncates objects at max depth", () => {
    const deepObj = { level1: { level2: { level3: { level4: "deep" } } } };
    const result = limitDepth(deepObj, 2);
    expect(result).toEqual({
      level1: {
        level2: { _truncated: true, _type: "object", _depth: 2 },
      },
    });
  });

  it("truncates arrays at max depth", () => {
    const deepArr = [[[["deep"]]]];
    const result = limitDepth(deepArr, 2);
    expect(result).toEqual([[{ _truncated: true, _type: "array", _depth: 2 }]]);
  });

  it("handles mixed nested structures", () => {
    const mixed = { arr: [{ nested: "value" }], obj: { arr: [1, 2] } };
    expect(limitDepth(mixed, 5)).toEqual(mixed);
  });

  it("preserves Date objects", () => {
    const date = new Date("2024-12-25");
    const obj = { date };
    const result = limitDepth(obj);
    expect(result.date).toBe(date);
  });

  it("uses default maxDepth of 14", () => {
    // Create an object with depth 15
    let deepObj: Record<string, unknown> = { value: "bottom" };
    for (let i = 0; i < 15; i++) {
      deepObj = { nested: deepObj };
    }
    const result = limitDepth(deepObj);
    // Should be truncated somewhere
    expect(JSON.stringify(result)).toContain("_truncated");
  });

  it("handles empty objects and arrays", () => {
    expect(limitDepth({})).toEqual({});
    expect(limitDepth([])).toEqual([]);
  });

  it("handles objects with symbol keys", () => {
    const sym = Symbol("test");
    // Symbol keys are not enumerable by Object.entries
    const obj = { regular: "value" };
    (obj as Record<symbol, unknown>)[sym] = "symbol value";
    const result = limitDepth(obj);
    expect(result).toEqual({ regular: "value" });
  });
});

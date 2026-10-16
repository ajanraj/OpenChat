import { describe, expect, it } from "vitest";

import { fetchClient } from "../fetch";

describe(fetchClient, () => {
  it("is defined", () => {
    expect(fetchClient).toBeDefined();
  });

  it("is the global fetch function", () => {
    expect(fetchClient).toBe(fetch);
  });

  it("is a function", () => {
    expect(fetchClient).toBeTypeOf("function");
  });
});

import { describe, expect, it } from "vitest";

import { openrouter } from "../openrouter";

describe("openrouter configuration", () => {
  it("exports openrouter instance", () => {
    expect(openrouter).toBeDefined();
  });

  it("openrouter is a function that creates models", () => {
    // OpenRouter provider should be callable to create models
    expect(openrouter).toBeTypeOf("function");
  });
});

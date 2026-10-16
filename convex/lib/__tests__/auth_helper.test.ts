import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "../../../src/lib/error-codes";
import { assertServerSecret } from "../auth_helper";

const SECRET = "s3cret-value";

function refusal(provided: string): unknown {
  try {
    assertServerSecret(provided);
    return null;
  } catch (error) {
    return error;
  }
}

describe("assertServerSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the configured secret", () => {
    vi.stubEnv("SERVER_ROUTE_SECRET", SECRET);
    expect(() => {
      assertServerSecret(SECRET);
    }).not.toThrow();
  });

  it.each([
    ["a different secret of the same length", "s3cret-valuX"],
    ["a prefix of the secret", "s3cret"],
    ["the secret with extra characters", `${SECRET}-extra`],
    ["an empty string", ""],
  ])("refuses %s", (_label, provided) => {
    vi.stubEnv("SERVER_ROUTE_SECRET", SECRET);
    const error = refusal(provided);
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<string>).data).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it("refuses every call while the secret is not configured", () => {
    vi.stubEnv("SERVER_ROUTE_SECRET", "");
    expect((refusal("") as ConvexError<string>).data).toBe(
      ERROR_CODES.UNAUTHORIZED
    );
    expect((refusal("anything") as ConvexError<string>).data).toBe(
      ERROR_CODES.UNAUTHORIZED
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("auth middleware", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.CONVEX_URL = "https://test.convex.cloud";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("json helper", () => {
    it("creates JSON response with correct content type", async () => {
      const { json } = await import("../auth");

      const response = json({ message: "test" });

      expect(response.headers.get("Content-Type")).toBe("application/json");
      const body: unknown = await response.json();
      expect(body).toStrictEqual({ message: "test" });
    });

    it("merges custom headers", async () => {
      const { json } = await import("../auth");

      const response = json(
        { data: "test" },
        {
          headers: {
            "X-Custom-Header": "custom-value",
          },
        }
      );

      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
    });

    it("applies custom status code", async () => {
      const { json } = await import("../auth");

      const response = json({ error: "test" }, { status: 400 });

      expect(response.status).toBe(400);
    });
  });

  describe("unauthorized helper", () => {
    it("returns 401 status with default message", async () => {
      const { unauthorized } = await import("../auth");

      const response = unauthorized();

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toStrictEqual({ error: "Unauthorized" });
    });

    it("returns 401 status with custom message", async () => {
      const { unauthorized } = await import("../auth");

      const response = unauthorized("Custom unauthorized message");

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toStrictEqual({ error: "Custom unauthorized message" });
    });
  });

  describe("notFound helper", () => {
    it("returns 404 status with default message", async () => {
      const { notFound } = await import("../auth");

      const response = notFound();

      expect(response.status).toBe(404);
      const body: unknown = await response.json();
      expect(body).toStrictEqual({ error: "Not found" });
    });

    it("returns 404 status with custom message", async () => {
      const { notFound } = await import("../auth");

      const response = notFound("Resource not found");

      expect(response.status).toBe(404);
      const body: unknown = await response.json();
      expect(body).toStrictEqual({ error: "Resource not found" });
    });
  });

  describe("badRequest helper", () => {
    it("returns 400 status with default message", async () => {
      const { badRequest } = await import("../auth");

      const response = badRequest();

      expect(response.status).toBe(400);
      const body: unknown = await response.json();
      expect(body).toStrictEqual({ error: "Bad request" });
    });

    it("returns 400 status with custom message", async () => {
      const { badRequest } = await import("../auth");

      const response = badRequest("Invalid input");

      expect(response.status).toBe(400);
      const body: unknown = await response.json();
      expect(body).toStrictEqual({ error: "Invalid input" });
    });
  });

  describe("getServerRouteSecret", () => {
    it("returns the configured secret", async () => {
      process.env.SERVER_ROUTE_SECRET = "route-secret";
      const { getServerRouteSecret } = await import("../auth");

      expect(getServerRouteSecret()).toBe("route-secret");
    });

    it("throws a configuration error when the secret is missing", async () => {
      delete process.env.SERVER_ROUTE_SECRET;
      const { getServerRouteSecret } = await import("../auth");

      expect(() => getServerRouteSecret()).toThrow(
        /SERVER_ROUTE_SECRET is missing/u
      );
    });
  });

  describe("AuthContext types", () => {
    it("exports AuthContext type", async () => {
      const module = await import("../auth");

      // Type check - AuthContext should be exported
      expect(module.json).toBeDefined();
      expect(module.unauthorized).toBeDefined();
      expect(module.notFound).toBeDefined();
      expect(module.badRequest).toBeDefined();
      expect(module.authMiddleware).toBeDefined();
    });
  });
});

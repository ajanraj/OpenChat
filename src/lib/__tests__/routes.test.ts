import { describe, expect, it } from "vitest";

import { API_ROUTE_CHAT, API_ROUTE_CREATE_CHAT } from "../routes";

describe("API Routes", () => {
  describe("API_ROUTE_CHAT constant", () => {
    it("is defined as a string", () => {
      expect(API_ROUTE_CHAT).toBeTypeOf("string");
    });

    it("starts with /api/", () => {
      expect(API_ROUTE_CHAT.startsWith("/api/")).toBeTruthy();
    });

    it("equals the expected value", () => {
      expect(API_ROUTE_CHAT).toBe("/api/chat");
    });
  });

  describe("API_ROUTE_CREATE_CHAT constant", () => {
    it("is defined as a string", () => {
      expect(API_ROUTE_CREATE_CHAT).toBeTypeOf("string");
    });

    it("starts with /api/", () => {
      expect(API_ROUTE_CREATE_CHAT.startsWith("/api/")).toBeTruthy();
    });

    it("equals the expected value", () => {
      expect(API_ROUTE_CREATE_CHAT).toBe("/api/create-chat");
    });
  });
});

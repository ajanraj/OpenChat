import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, getErrorMessage } from "@/lib/error-codes";
import { getTaskErrorMessage } from "./task-errors";

describe("getTaskErrorMessage", () => {
	const fallback = "Failed to update task. Please try again.";

	it("maps known error codes to their friendly message", () => {
		expect(
			getTaskErrorMessage(new ConvexError(ERROR_CODES.INVALID_INPUT), fallback),
		).toBe(getErrorMessage(ERROR_CODES.INVALID_INPUT));
		expect(
			getTaskErrorMessage(
				new ConvexError(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED),
				fallback,
			),
		).toBe(getErrorMessage(ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED));
	});

	it("shows server-written ConvexError messages such as task limits", () => {
		expect(
			getTaskErrorMessage(
				new ConvexError("Daily task limit reached (max 5)"),
				fallback,
			),
		).toBe("Daily task limit reached (max 5)");
	});

	it("falls back for non-Convex errors and structured payloads", () => {
		expect(getTaskErrorMessage(new Error("Server Error"), fallback)).toBe(
			fallback,
		);
		expect(
			getTaskErrorMessage(new ConvexError({ code: "X" }), fallback),
		).toBe(fallback);
	});
});

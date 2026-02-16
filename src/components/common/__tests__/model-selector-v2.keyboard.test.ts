import { describe, expect, it } from "vitest";
import {
	FAVORITES_PROVIDER_ID,
	getClampedNextIndex,
	getClampedPreviousIndex,
	getProviderFocusId,
} from "../model-selector-v2.keyboard";

describe("model-selector-v2 keyboard helpers", () => {
	it("clamps next index and does not wrap", () => {
		expect(getClampedNextIndex(-1, 3)).toBe(0);
		expect(getClampedNextIndex(0, 3)).toBe(1);
		expect(getClampedNextIndex(2, 3)).toBe(2);
	});

	it("clamps previous index and does not wrap", () => {
		expect(getClampedPreviousIndex(2, 3)).toBe(1);
		expect(getClampedPreviousIndex(0, 3)).toBe(0);
		expect(getClampedPreviousIndex(-1, 3)).toBe(0);
	});

	it("returns null indices for empty lists", () => {
		expect(getClampedNextIndex(0, 0)).toBeNull();
		expect(getClampedPreviousIndex(0, 0)).toBeNull();
	});

	it("focuses active provider when present", () => {
		expect(getProviderFocusId("openai", [FAVORITES_PROVIDER_ID, "openai"])).toBe(
			"openai",
		);
	});

	it("falls back to favorites when active provider is missing", () => {
		expect(getProviderFocusId("anthropic", [FAVORITES_PROVIDER_ID, "openai"])).toBe(
			FAVORITES_PROVIDER_ID,
		);
	});

	it("falls back to first provider when favorites is absent", () => {
		expect(getProviderFocusId(null, ["openai", "anthropic"])).toBe("openai");
	});
});

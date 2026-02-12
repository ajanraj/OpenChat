import { describe, expect, it } from "vitest";
import {
	DEFAULT_LEGACY_SCOPE_KEY,
	getLegacyScopeKey,
	getProviderFilter,
	shouldHideProviderSidebar,
} from "../model-selector-v2.utils";

describe("model-selector-v2 utils", () => {
	it("hides provider sidebar when search query has text", () => {
		expect(shouldHideProviderSidebar("gpt", new Set())).toBe(true);
		expect(shouldHideProviderSidebar("  ", new Set())).toBe(false);
	});

	it("hides provider sidebar when at least one filter is active", () => {
		expect(
			shouldHideProviderSidebar("", new Set(["reasoning"])),
		).toBe(true);
	});

	it("clears provider filter while search or filters are active", () => {
		expect(getProviderFilter("gpt", new Set(), "openai")).toBeNull();
		expect(getProviderFilter("", new Set(["vision"]), "openai")).toBeNull();
		expect(getProviderFilter("", new Set(), "openai")).toBe("openai");
	});

	it("scopes legacy expand state by provider", () => {
		expect(getLegacyScopeKey("openai")).toBe("openai");
		expect(getLegacyScopeKey("gemini")).toBe("gemini");
		expect(getLegacyScopeKey(null)).toBe(DEFAULT_LEGACY_SCOPE_KEY);
	});
});

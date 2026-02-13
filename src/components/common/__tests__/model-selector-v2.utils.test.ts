import { describe, expect, it } from "vitest";
import {
	DEFAULT_LEGACY_SCOPE_KEY,
	getNormalizedSearchQuery,
	getLegacyScopeKey,
	getModelUnavailableReasons,
	getProviderFilter,
	isUnpinningLastFavoriteModel,
	shouldShowFavoritesOnly,
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

	it("shows favorites-only scope when no provider is selected", () => {
		expect(shouldShowFavoritesOnly("", new Set(), null)).toBe(true);
		expect(shouldShowFavoritesOnly("gpt", new Set(), null)).toBe(false);
		expect(shouldShowFavoritesOnly("", new Set(["vision"]), null)).toBe(false);
		expect(shouldShowFavoritesOnly("", new Set(), "openai")).toBe(false);
	});

	it("scopes legacy expand state by provider", () => {
		expect(getLegacyScopeKey("openai")).toBe("openai");
		expect(getLegacyScopeKey("gemini")).toBe("gemini");
		expect(getLegacyScopeKey(null)).toBe(DEFAULT_LEGACY_SCOPE_KEY);
	});

	it("normalizes search query by trimming surrounding whitespace", () => {
		expect(getNormalizedSearchQuery("  GPT  ")).toBe("gpt");
		expect(getNormalizedSearchQuery("   ")).toBe("");
	});

	it("detects attempts to unpin the last favorite model", () => {
		expect(isUnpinningLastFavoriteModel(true, 1)).toBe(true);
		expect(isUnpinningLastFavoriteModel(true, 2)).toBe(false);
		expect(isUnpinningLastFavoriteModel(false, 1)).toBe(false);
	});

	it("returns unavailable model reasons for premium/api-key gates", () => {
		expect(
			getModelUnavailableReasons({
				available: true,
				premium: true,
				userKeyOnly: true,
			}),
		).toEqual([]);

		expect(
			getModelUnavailableReasons({
				available: false,
				premium: false,
				userKeyOnly: true,
			}),
		).toEqual(["API key required"]);

		expect(
			getModelUnavailableReasons({
				available: false,
				premium: true,
				userKeyOnly: false,
			}),
		).toEqual(["Premium subscription required"]);

		expect(
			getModelUnavailableReasons({
				available: false,
				premium: true,
				userKeyOnly: true,
			}),
		).toEqual(["Premium subscription required", "API key required"]);
	});
});

export const DEFAULT_LEGACY_SCOPE_KEY = "__all__";

export function getNormalizedSearchQuery(searchQuery: string): string {
	return searchQuery.trim().toLowerCase();
}

export function isUnpinningLastFavoriteModel(
	isFavorite: boolean,
	favoriteModelsCount: number,
): boolean {
	return isFavorite && favoriteModelsCount <= 1;
}

export function shouldHideProviderSidebar(
	searchQuery: string,
	activeFilters: ReadonlySet<string>,
): boolean {
	return getNormalizedSearchQuery(searchQuery).length > 0 || activeFilters.size > 0;
}

export function getProviderFilter(
	searchQuery: string,
	activeFilters: ReadonlySet<string>,
	activeProvider: string | null,
): string | null {
	return shouldHideProviderSidebar(searchQuery, activeFilters)
		? null
		: activeProvider;
}

export function shouldShowFavoritesOnly(
	searchQuery: string,
	activeFilters: ReadonlySet<string>,
	activeProvider: string | null,
): boolean {
	return (
		!shouldHideProviderSidebar(searchQuery, activeFilters) &&
		activeProvider === null
	);
}

type ModelUnavailableReasonInput = {
	available: boolean;
	premium: boolean;
	userKeyOnly: boolean;
};

export function getModelUnavailableReasons({
	available,
	premium,
	userKeyOnly,
}: ModelUnavailableReasonInput): readonly string[] {
	if (available) {
		return [];
	}
	const reasons: string[] = [];
	if (premium) {
		reasons.push("Premium subscription required");
	}
	if (userKeyOnly) {
		reasons.push("API key required");
	}
	if (reasons.length === 0) {
		reasons.push("Model unavailable for your current setup");
	}
	return reasons;
}

export function getLegacyScopeKey(providerFilter: string | null): string {
	return providerFilter ?? DEFAULT_LEGACY_SCOPE_KEY;
}

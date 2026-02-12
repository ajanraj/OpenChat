export const DEFAULT_LEGACY_SCOPE_KEY = "__all__";

export function shouldHideProviderSidebar(
	searchQuery: string,
	activeFilters: ReadonlySet<string>,
): boolean {
	return searchQuery.trim().length > 0 || activeFilters.size > 0;
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

export function getLegacyScopeKey(providerFilter: string | null): string {
	return providerFilter ?? DEFAULT_LEGACY_SCOPE_KEY;
}

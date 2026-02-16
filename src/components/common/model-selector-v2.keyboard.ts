export const FAVORITES_PROVIDER_ID = "favorites";

export function getClampedNextIndex(
	currentIndex: number,
	length: number,
): number | null {
	if (length <= 0) {
		return null;
	}

	if (currentIndex < 0) {
		return 0;
	}

	return Math.min(currentIndex + 1, length - 1);
}

export function getClampedPreviousIndex(
	currentIndex: number,
	length: number,
): number | null {
	if (length <= 0) {
		return null;
	}

	if (currentIndex <= 0) {
		return 0;
	}

	return currentIndex - 1;
}

export function getProviderFocusId(
	activeProvider: string | null,
	providerIds: string[],
): string {
	if (activeProvider && providerIds.includes(activeProvider)) {
		return activeProvider;
	}

	if (providerIds.includes(FAVORITES_PROVIDER_ID)) {
		return FAVORITES_PROVIDER_ID;
	}

	return providerIds[0] ?? FAVORITES_PROVIDER_ID;
}

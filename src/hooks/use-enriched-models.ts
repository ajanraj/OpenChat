import { useMemo } from "react";

import { MODELS_OPTIONS } from "@/lib/config/models";
import { PROVIDERS_OPTIONS } from "@/lib/config/providers";
import { useUser } from "@/providers/user-provider";

import { useModelPreferences } from "./use-model-preferences";

export interface EnrichedModel {
  id: string;
  name: string;
  subName?: string;
  provider: string;
  premium: boolean;
  usesPremiumCredits: boolean;
  legacy?: boolean;
  description: string;
  apiKeyUsage: {
    allowUserKey: boolean;
    userKeyOnly: boolean;
  };
  features: {
    id: string;
    enabled: boolean;
    label?: string;
  }[];
  // Enriched properties
  providerInfo: (typeof PROVIDERS_OPTIONS)[0] | undefined;
  available: boolean;
  featuresMap: Record<string, boolean>;
}

export const useEnrichedModels = () => {
  const { hasPremium, apiKeys } = useUser();
  const { favoriteModelsSet } = useModelPreferences();

  // Transform API keys array to Map for O(1) lookups
  const apiKeysMap = useMemo(
    () => new Map(apiKeys.map((key) => [key.provider, true])),
    [apiKeys]
  );

  const enrichedModels = useMemo(
    () =>
      MODELS_OPTIONS.map((model): EnrichedModel => {
        // Compute availability once
        const userHasKey = apiKeysMap.has(model.provider);
        const requiresKey = model.apiKeyUsage?.userKeyOnly ?? false;
        const canUseWithKey = !requiresKey || userHasKey;
        const requiresPremium = model.premium ?? false;
        const canUseAsPremium = !requiresPremium || hasPremium || userHasKey;
        const available = canUseWithKey && canUseAsPremium;
        // Pre-compute features map for O(1) feature lookups
        const featuresMap: Record<string, boolean> = Object.fromEntries(
          model.features.map((feature) => [feature.id, feature.enabled])
        );

        // Find provider info once - use displayProvider for UI, fallback to provider
        const modelWithDisplayProvider = model as typeof model & {
          displayProvider?: string;
        };
        const { displayProvider } = modelWithDisplayProvider;
        const providerId =
          displayProvider !== undefined && displayProvider !== ""
            ? displayProvider
            : model.provider;
        const providerInfo = PROVIDERS_OPTIONS.find((p) => p.id === providerId);

        return {
          ...model,
          providerInfo,
          available,
          featuresMap,
        };
      }),
    [apiKeysMap, hasPremium]
  );

  // Separate models by category for efficient filtering
  const categorizedModels = useMemo(() => {
    const favorites: EnrichedModel[] = [];
    const others: EnrichedModel[] = [];
    const available: EnrichedModel[] = [];
    const unavailable: EnrichedModel[] = [];

    for (const model of enrichedModels) {
      // Categorize by favorite status
      if (favoriteModelsSet.has(model.id)) {
        favorites.push(model);
      } else {
        others.push(model);
      }

      // Categorize by availability
      if (model.available) {
        available.push(model);
      } else {
        unavailable.push(model);
      }
    }

    // Sort by availability (available first)
    const sortByAvailability = (a: EnrichedModel, b: EnrichedModel) => {
      if (a.available === b.available) {
        return 0;
      }
      return a.available ? -1 : 1;
    };

    return {
      all: enrichedModels,
      favorites: favorites.toSorted(sortByAvailability),
      others: others.toSorted(sortByAvailability),
      available,
      unavailable,
    };
  }, [enrichedModels, favoriteModelsSet]);

  // Feature map for efficient feature-based filtering
  const featureMap = useMemo(() => {
    const map = new Map<string, EnrichedModel[]>();

    for (const model of enrichedModels) {
      for (const [featureId, enabled] of Object.entries(model.featuresMap)) {
        if (enabled) {
          if (!map.has(featureId)) {
            map.set(featureId, []);
          }
          const featureList = map.get(featureId);
          if (featureList) {
            featureList.push(model);
          }
        }
      }
    }

    return map;
  }, [enrichedModels]);

  return {
    enrichedModels,
    categorizedModels,
    featureMap,
    apiKeysMap,
  };
};

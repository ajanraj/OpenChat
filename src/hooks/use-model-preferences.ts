import { useMutation } from "convex/react";
import { useCallback, useMemo } from "react";
import { useProfile } from "@/providers/profile-provider";
import { useUser } from "@/providers/user-provider";
import { api } from "../../convex/_generated/api";
import type { Profile } from "@/providers/profile-provider";

export function useModelPreferences() {
  const { user } = useUser();
  const { activeProfile } = useProfile();

  const toggleFavoriteModelMutation = useMutation(
    api.profiles.toggleProfileFavoriteModel,
  ).withOptimisticUpdate((localStore, { profileId, modelId }) => {
    const profiles = localStore.getQuery(api.profiles.listProfiles, {});
    if (!profiles) {
      return;
    }

    localStore.setQuery(
      api.profiles.listProfiles,
      {},
      profiles.map((p: Profile) => {
        if (p._id !== profileId) {
          return p;
        }

        const favorites = p.favoriteModels ?? [];
        const isFavorite = favorites.includes(modelId);

        if (isFavorite && favorites.length <= 1) {
          return p;
        }

        const newFavorites = isFavorite
          ? favorites.filter((id) => id !== modelId)
          : [...favorites, modelId];

        return { ...p, favoriteModels: newFavorites };
      }),
    );
  });

  const bulkSetFavoriteModelsMutation = useMutation(
    api.profiles.bulkSetProfileFavoriteModels,
  ).withOptimisticUpdate((localStore, { profileId, modelIds }) => {
    const profiles = localStore.getQuery(api.profiles.listProfiles, {});
    if (!profiles) {
      return;
    }

    localStore.setQuery(
      api.profiles.listProfiles,
      {},
      profiles.map((p: Profile) => {
        if (p._id !== profileId) {
          return p;
        }

        const currentDisabled = p.disabledModels ?? [];
        const newFavorites = [...new Set(modelIds)];
        const newDisabled = currentDisabled.filter((id) => !newFavorites.includes(id));

        return { ...p, favoriteModels: newFavorites, disabledModels: newDisabled };
      }),
    );
  });

  const favoriteModels = useMemo(
    () => activeProfile?.favoriteModels ?? user?.favoriteModels ?? [],
    [activeProfile?.favoriteModels, user?.favoriteModels],
  );

  const favoriteModelsSet = useMemo(() => new Set(favoriteModels), [favoriteModels]);

  const toggleFavoriteModel = useCallback(
    async (modelId: string) => {
      if (!activeProfile?._id) {
        throw new Error("No active profile");
      }

      const isFavorite = favoriteModels.includes(modelId);

      if (isFavorite && favoriteModels.length <= 1) {
        throw new Error("Cannot remove the last favorite model");
      }

      try {
        await toggleFavoriteModelMutation({ profileId: activeProfile._id, modelId });
      } catch (error) {
        throw new Error(
          `Failed to ${isFavorite ? "unpin" : "pin"} model: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
    [activeProfile?._id, favoriteModels, toggleFavoriteModelMutation],
  );

  const bulkSetFavoriteModels = useCallback(
    async (modelIds: string[]) => {
      if (!activeProfile?._id) {
        throw new Error("No active profile");
      }

      if (modelIds.length === 0) {
        throw new Error("At least one favorite model must be provided");
      }

      try {
        await bulkSetFavoriteModelsMutation({ profileId: activeProfile._id, modelIds });
      } catch (error) {
        throw new Error(
          `Failed to set favorite models: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
    [activeProfile?._id, bulkSetFavoriteModelsMutation],
  );

  return {
    favoriteModels,
    favoriteModelsSet,
    toggleFavoriteModel,
    bulkSetFavoriteModels,
  };
}

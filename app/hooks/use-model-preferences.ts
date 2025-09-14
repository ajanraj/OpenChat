"use client";

import { useMutation } from "convex/react";
import { useCallback, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { useUser } from "../providers/user-provider";

export function useModelPreferences() {
  const { user } = useUser();
  const toggleFavoriteModelMutation = useMutation(
    api.users.toggleFavoriteModel
  ).withOptimisticUpdate((localStore, { modelId }) => {
    const currentUser = localStore.getQuery(api.users.getCurrentUser, {});
    if (!currentUser?.favoriteModels) {
      return;
    }

    const favorites = currentUser.favoriteModels;
    const isFavorite = favorites.includes(modelId);

    // Don't remove last favorite
    if (isFavorite && favorites.length <= 1) {
      return;
    }

    const newFavorites = isFavorite
      ? favorites.filter((id) => id !== modelId)
      : [...favorites, modelId];

    localStore.setQuery(
      api.users.getCurrentUser,
      {},
      {
        ...currentUser,
        favoriteModels: newFavorites,
      }
    );
  });

  const bulkSetFavoriteModelsMutation = useMutation(
    api.users.bulkSetFavoriteModels
  ).withOptimisticUpdate((localStore, { modelIds }) => {
    const currentUser = localStore.getQuery(api.users.getCurrentUser, {});
    if (!currentUser) {
      return;
    }

    const currentDisabled = currentUser.disabledModels ?? [];
    const newFavorites = [...new Set(modelIds)];

    // Remove favorite models from disabled list (auto-enable favorites)
    const newDisabled = currentDisabled.filter(
      (id) => !newFavorites.includes(id)
    );

    localStore.setQuery(
      api.users.getCurrentUser,
      {},
      {
        ...currentUser,
        favoriteModels: newFavorites,
        disabledModels: newDisabled,
      }
    );
  });

  const favoriteModels = useMemo(
    () => user?.favoriteModels ?? [],
    [user?.favoriteModels]
  );

  const favoriteModelsSet = useMemo(
    () => new Set(favoriteModels),
    [favoriteModels]
  );

  const toggleFavoriteModel = useCallback(
    async (modelId: string) => {
      if (!user) {
        throw new Error("User not authenticated");
      }

      const isFavorite = favoriteModels.includes(modelId);

      // Prevent removing the last favorite model (business rule check)
      if (isFavorite && favoriteModels.length <= 1) {
        throw new Error("Cannot remove the last favorite model");
      }

      try {
        await toggleFavoriteModelMutation({ modelId });
      } catch (error) {
        throw new Error(
          `Failed to ${isFavorite ? "unpin" : "pin"} model: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    },
    [user, favoriteModels, toggleFavoriteModelMutation]
  );

  const bulkSetFavoriteModels = useCallback(
    async (modelIds: string[]) => {
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Ensure at least one favorite model is provided
      if (modelIds.length === 0) {
        throw new Error("At least one favorite model must be provided");
      }

      try {
        await bulkSetFavoriteModelsMutation({ modelIds });
      } catch (error) {
        throw new Error(
          `Failed to set favorite models: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    },
    [user, bulkSetFavoriteModelsMutation]
  );

  return {
    favoriteModels,
    favoriteModelsSet,
    toggleFavoriteModel,
    bulkSetFavoriteModels,
  };
}

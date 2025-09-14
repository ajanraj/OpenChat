"use client";

import { useMutation } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { MODEL_DEFAULT } from "@/lib/config";
import { useUser } from "../providers/user-provider";

/**
 * Hook specifically for the settings page to manage model enable/disable state
 */
export function useModelSettings() {
  const { user } = useUser();
  const setModelEnabled = useMutation(
    api.users.setModelEnabled
  ).withOptimisticUpdate((localStore, { modelId, enabled }) => {
    const currentUser = localStore.getQuery(api.users.getCurrentUser, {});
    if (!currentUser) {
      return;
    }

    const currentDisabled = currentUser.disabledModels ?? [];
    const currentFavorites = currentUser.favoriteModels ?? [];

    let newDisabled: string[];
    let newFavorites = currentFavorites;

    if (enabled) {
      // Enabling model - remove from disabled list
      newDisabled = currentDisabled.filter((id) => id !== modelId);
    } else {
      // Disabling model - add to disabled list and remove from favorites
      if (modelId === MODEL_DEFAULT) {
        return; // Cannot disable default model
      }

      newDisabled = currentDisabled.includes(modelId)
        ? currentDisabled
        : [...currentDisabled, modelId];
      newFavorites = currentFavorites.filter((id) => id !== modelId);

      // Ensure at least one favorite remains
      if (newFavorites.length === 0 && currentFavorites.length > 0) {
        const firstFavorite = currentFavorites[0];
        newFavorites = [firstFavorite];
        newDisabled = newDisabled.filter((id) => id !== firstFavorite);
      }
    }

    localStore.setQuery(
      api.users.getCurrentUser,
      {},
      {
        ...currentUser,
        disabledModels: newDisabled,
        favoriteModels: newFavorites,
      }
    );
  });

  const bulkSetModelsDisabled = useMutation(
    api.users.bulkSetModelsDisabled
  ).withOptimisticUpdate((localStore, { modelIds }) => {
    const currentUser = localStore.getQuery(api.users.getCurrentUser, {});
    if (!currentUser) {
      return;
    }

    const currentFavorites = currentUser.favoriteModels ?? [];
    const currentDisabled = currentUser.disabledModels ?? [];

    // Filter out MODEL_DEFAULT from the models to disable
    const modelsToDisable = modelIds.filter((id) => id !== MODEL_DEFAULT);

    // Remove disabled models from favorites
    let newFavorites = currentFavorites.filter(
      (id) => !modelsToDisable.includes(id)
    );
    // Merge with existing disabled models
    let newDisabled = [...new Set([...currentDisabled, ...modelsToDisable])];

    // Ensure at least one favorite remains
    if (newFavorites.length === 0 && currentFavorites.length > 0) {
      const firstFavorite = currentFavorites[0];
      newFavorites = [firstFavorite];
      newDisabled = newDisabled.filter((id) => id !== firstFavorite);
    }

    localStore.setQuery(
      api.users.getCurrentUser,
      {},
      {
        ...currentUser,
        disabledModels: newDisabled,
        favoriteModels: newFavorites,
      }
    );
  });

  const disabledModelsSet = useMemo(
    () => new Set(user?.disabledModels ?? []),
    [user?.disabledModels]
  );

  const isModelEnabled = (modelId: string) => !disabledModelsSet.has(modelId);

  return {
    disabledModelsSet,
    isModelEnabled,
    setModelEnabled,
    bulkSetModelsDisabled,
  };
}

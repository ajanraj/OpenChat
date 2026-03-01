import { useMutation } from "convex/react";
import { useMemo } from "react";
import { MODEL_DEFAULT } from "@/lib/config";
import { useProfile } from "@/providers/profile-provider";
import { useUser } from "@/providers/user-provider";
import { api } from "../../convex/_generated/api";
import type { Profile } from "@/providers/profile-provider";

/**
 * Hook specifically for the settings page to manage model enable/disable state.
 * Reads/writes profile-scoped disabledModels, falls back to user doc.
 */
export function useModelSettings() {
  const { user } = useUser();
  const { activeProfile } = useProfile();

  const setModelEnabled = useMutation(api.profiles.setProfileModelEnabled).withOptimisticUpdate(
    (localStore, { profileId, modelId, enabled }) => {
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
          const currentFavorites = p.favoriteModels ?? [];

          let newDisabled: string[];
          let newFavorites = currentFavorites;

          if (enabled) {
            newDisabled = currentDisabled.filter((id) => id !== modelId);
          } else {
            if (modelId === MODEL_DEFAULT) {
              return p;
            }

            newDisabled = currentDisabled.includes(modelId)
              ? currentDisabled
              : [...currentDisabled, modelId];
            newFavorites = currentFavorites.filter((id) => id !== modelId);

            if (newFavorites.length === 0 && currentFavorites.length > 0) {
              const firstFavorite = currentFavorites[0];
              newFavorites = [firstFavorite];
              newDisabled = newDisabled.filter((id) => id !== firstFavorite);
            }
          }

          return { ...p, disabledModels: newDisabled, favoriteModels: newFavorites };
        }),
      );
    },
  );

  const bulkSetModelsDisabled = useMutation(
    api.profiles.bulkSetProfileModelsDisabled,
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

        const currentFavorites = p.favoriteModels ?? [];
        const currentDisabled = p.disabledModels ?? [];
        const modelsToDisable = modelIds.filter((id) => id !== MODEL_DEFAULT);

        let newFavorites: string[];
        let newDisabled: string[];

        if (modelsToDisable.length === 0) {
          newDisabled = [];
          newFavorites = currentFavorites;
        } else {
          newFavorites = currentFavorites.filter((id) => !modelsToDisable.includes(id));
          newDisabled = [...new Set([...currentDisabled, ...modelsToDisable])];

          if (newFavorites.length === 0 && currentFavorites.length > 0) {
            const firstFavorite = currentFavorites[0];
            newFavorites = [firstFavorite];
            newDisabled = newDisabled.filter((id) => id !== firstFavorite);
          }
        }

        return { ...p, disabledModels: newDisabled, favoriteModels: newFavorites };
      }),
    );
  });

  const disabledModelsSet = useMemo(
    () => new Set(activeProfile?.disabledModels ?? user?.disabledModels ?? []),
    [activeProfile?.disabledModels, user?.disabledModels],
  );

  const isModelEnabled = (modelId: string) => !disabledModelsSet.has(modelId);

  return {
    disabledModelsSet,
    isModelEnabled,
    setModelEnabled: (args: { modelId: string; enabled: boolean }) => {
      if (!activeProfile?._id) {
        return Promise.reject(new Error("Profile not loaded"));
      }
      return setModelEnabled({ profileId: activeProfile._id, ...args });
    },
    bulkSetModelsDisabled: (args: { modelIds: string[] }) => {
      if (!activeProfile?._id) {
        return Promise.reject(new Error("Profile not loaded"));
      }
      return bulkSetModelsDisabled({ profileId: activeProfile._id, ...args });
    },
  };
}

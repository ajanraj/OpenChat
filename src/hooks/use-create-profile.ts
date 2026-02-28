import { useMutation } from "convex/react";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/components/ui/toast";
import type { ProfileIconName } from "@/lib/config/profile-icons";

interface CreateProfileData {
  name: string;
  icon: ProfileIconName;
  copyFromProfileId?: Id<"profiles">;
}

export function useCreateProfile(onSuccess?: (id: Id<"profiles">) => void) {
  const createProfile = useMutation(api.profiles.createProfile);

  return useCallback(
    async (data: CreateProfileData) => {
      try {
        const id = await createProfile({
          name: data.name,
          icon: data.icon,
          copyFromProfileId: data.copyFromProfileId,
        });
        toast({ title: `Profile "${data.name}" created`, status: "success" });
        onSuccess?.(id);
        return id;
      } catch {
        toast({ title: "Failed to create profile", status: "error" });
        return null;
      }
    },
    [createProfile, onSuccess],
  );
}

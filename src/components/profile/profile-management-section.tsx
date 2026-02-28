import { PencilSimple, Trash } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CreateProfileDialog } from "@/components/profile/create-profile-dialog";
import { PhosphorIcon } from "@/components/profile/phosphor-icon";
import { ProfileIconPicker } from "@/components/profile/profile-icon-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { PROFILE_ICONS, isProfileIconName } from "@/lib/config/profile-icons";
import type { ProfileIconName } from "@/lib/config/profile-icons";
import type { Profile } from "@/providers/profile-provider";

interface ProfileManagementSectionProps {
  profiles: Profile[];
  activeProfile: Profile | undefined;
  setActiveProfile: (profileId: Id<"profiles">) => void;
}

export function ProfileManagementSection({
  profiles,
  activeProfile,
  setActiveProfile,
}: ProfileManagementSectionProps) {
  const updateProfile = useMutation(api.profiles.updateProfile);
  const deleteProfileMutation = useMutation(api.profiles.deleteProfile);

  const [isProfileSelectOpen, setIsProfileSelectOpen] = useState(false);
  const [deleteConfirmProfileId, setDeleteConfirmProfileId] = useState<Id<"profiles"> | null>(null);
  const [editProfile, setEditProfile] = useState<{
    id: Id<"profiles">;
    name: string;
    icon: ProfileIconName;
    isSaving: boolean;
  } | null>(null);

  const profileBeingEdited = profiles.find((p) => p._id === editProfile?.id);
  const trimmedEditName = (editProfile?.name ?? "").trim();
  const hasEditChanges =
    Boolean(profileBeingEdited) &&
    (trimmedEditName !== profileBeingEdited?.name || editProfile?.icon !== profileBeingEdited?.icon);
  const canSaveEdit =
    Boolean(profileBeingEdited) &&
    trimmedEditName.length > 0 &&
    hasEditChanges &&
    !editProfile?.isSaving;

  const handleOpenEdit = (profile: Profile) => {
    setIsProfileSelectOpen(false);
    setEditProfile({
      id: profile._id,
      name: profile.name,
      icon: isProfileIconName(profile.icon) ? profile.icon : PROFILE_ICONS[0],
      isSaving: false,
    });
  };

  const handleDeleteFromDropdown = (profile: Profile) => {
    if (profile.isDefault) return;
    setIsProfileSelectOpen(false);
    setDeleteConfirmProfileId(profile._id);
  };

  const closeEditDialog = () => setEditProfile(null);

  const handleSaveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profileBeingEdited || !canSaveEdit || !editProfile) return;

    try {
      setEditProfile((prev) => prev && { ...prev, isSaving: true });
      await updateProfile({
        profileId: profileBeingEdited._id,
        updates: { name: trimmedEditName, icon: editProfile.icon },
      });
      toast({ title: "Profile updated", status: "success" });
      closeEditDialog();
    } catch {
      setEditProfile((prev) => prev && { ...prev, isSaving: false });
      toast({ title: "Failed to update profile", status: "error" });
    }
  };

  if (profiles.length === 0) return null;

  return (
    <>
      <header className="space-y-4">
        <h1 className="font-semibold text-2xl tracking-tight">Profile</h1>
        <p className="text-muted-foreground leading-relaxed">
          Profiles let you maintain separate settings and chat spaces.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="mb-1.5 block text-sm" htmlFor="active-profile">
              Active Profile
            </Label>
            <Select
              onOpenChange={setIsProfileSelectOpen}
              onValueChange={(val) => setActiveProfile(val as Id<"profiles">)}
              open={isProfileSelectOpen}
              value={activeProfile?._id}
            >
              <SelectTrigger className="w-full" id="active-profile">
                {activeProfile ? (
                  <span className="flex items-center gap-2">
                    <PhosphorIcon className="size-3.5" name={activeProfile.icon} weight="fill" />
                    {activeProfile.name}
                  </span>
                ) : (
                  <SelectValue placeholder="Select profile" />
                )}
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem
                    className="pr-16 [&>span.absolute]:hidden"
                    key={p._id}
                    value={p._id}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <PhosphorIcon className="size-3.5" name={p.icon} weight="fill" />
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="absolute top-1/2 right-1.5 z-10 flex -translate-y-1/2 items-center gap-1">
                      <button
                        aria-label={`Edit ${p.name}`}
                        className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleOpenEdit(p);
                        }}
                        type="button"
                      >
                        <PencilSimple className="size-3.5" />
                      </button>
                      <button
                        aria-label={`Delete ${p.name}`}
                        className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        disabled={p.isDefault}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteFromDropdown(p);
                        }}
                        type="button"
                      >
                        <Trash className="size-3.5" />
                      </button>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {profiles.length < 5 && <CreateProfileDialog />}
        </div>
      </section>

      {/* Edit Profile Dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) closeEditDialog();
        }}
        open={Boolean(profileBeingEdited)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          {profileBeingEdited && (
            <form onSubmit={handleSaveEdit}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label className="text-sm" htmlFor="edit-profile-name">
                    Name
                  </Label>
                  <div className="flex gap-2">
                    <ProfileIconPicker
                      onChange={(icon) => setEditProfile((prev) => prev && { ...prev, icon })}
                      value={editProfile?.icon ?? PROFILE_ICONS[0]}
                    />
                    <Input
                      id="edit-profile-name"
                      maxLength={50}
                      onChange={(e) =>
                        setEditProfile((prev) => prev && { ...prev, name: e.target.value })
                      }
                      placeholder="Work, Personal, etc."
                      value={editProfile?.name ?? ""}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                <Button className="cursor-pointer" onClick={closeEditDialog} type="button" variant="outline">
                  Cancel
                </Button>
                <Button className="cursor-pointer" disabled={!canSaveEdit} type="submit">
                  {editProfile?.isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Profile Confirmation Dialog */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmProfileId(null);
        }}
        open={Boolean(deleteConfirmProfileId)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Profile</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the profile and move its chats to the Default profile. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteConfirmProfileId) return;
                try {
                  await deleteProfileMutation({ profileId: deleteConfirmProfileId });
                  setDeleteConfirmProfileId(null);
                  toast({ title: "Profile deleted", status: "success" });
                } catch {
                  toast({ title: "Failed to delete profile", status: "error" });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

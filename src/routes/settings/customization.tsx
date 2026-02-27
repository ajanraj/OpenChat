import { PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CodeBlock, CodeBlockCode } from "@/components/prompt-kit/code-block";
import { CreateProfileDialog } from "@/components/profile/create-profile-dialog";
import { ProfileIconPicker } from "@/components/profile/profile-icon-picker";
import { PhosphorIcon } from "@/components/profile/profile-form-fields";
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
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { ThemeFontControls } from "@/components/ui/theme-font-controls";
import { ThemeSelector } from "@/components/ui/theme-selector";
import { toast } from "@/components/ui/toast";
import { APP_NAME } from "@/lib/config";
import { PROFILE_ICONS } from "@/lib/config/profile-icons";
import type { ProfileIconName } from "@/lib/config/profile-icons";
import { useEditorStore } from "@/lib/store/editor-store";
import type { FontCategory, FontOption } from "@/lib/theme/theme-fonts";
import type { Profile } from "@/providers/profile-provider";
import { useProfile } from "@/providers/profile-provider";

export const Route = createFileRoute("/settings/customization")({
  component: CustomizationSettingsPage,
});

interface CustomizationDraft {
  preferredName: string;
  occupation: string;
  traits: string[];
  about: string;
}

function getProfileCustomizationSnapshot(profile: Profile | undefined): CustomizationDraft {
  return {
    preferredName: profile?.preferredName ?? "",
    occupation: profile?.occupation ?? "",
    traits: profile?.traits ? profile.traits.split(", ") : [],
    about: profile?.about ?? "",
  };
}

function isProfileIconName(icon: string): icon is ProfileIconName {
  return PROFILE_ICONS.some((profileIcon) => profileIcon === icon);
}

export function CustomizationSettingsPage() {
  return useCustomizationSettingsPageView();
}

function useCustomizationSettingsPageView() {
  const { profiles, activeProfile, setActiveProfile } = useProfile();
  const updateProfile = useMutation(api.profiles.updateProfile);
  const deleteProfileMutation = useMutation(api.profiles.deleteProfile);
  const router = useRouter();
  const themeState = useEditorStore((state) => state.themeState);
  const updateFont = useEditorStore((state) => state.updateFont);

  const [isProfileSelectOpen, setIsProfileSelectOpen] = useState(false);
  const [deleteConfirmProfileId, setDeleteConfirmProfileId] = useState<Id<"profiles"> | null>(null);
  const [editProfileId, setEditProfileId] = useState<Id<"profiles"> | null>(null);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfileIcon, setEditProfileIcon] = useState<ProfileIconName>(PROFILE_ICONS[0]);
  const [isSavingProfileEdit, setIsSavingProfileEdit] = useState(false);

  const profileSnapshot = getProfileCustomizationSnapshot(activeProfile);
  const [draft, setDraft] = useState<CustomizationDraft | null>(null);
  const [traitInput, setTraitInput] = useState("");
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const currentValues = draft ?? profileSnapshot;
  const { preferredName, occupation, traits, about } = currentValues;
  const profileBeingEdited = profiles.find((profile) => profile._id === editProfileId);
  const trimmedEditProfileName = editProfileName.trim();
  const hasProfileEditChanges =
    Boolean(profileBeingEdited) &&
    (trimmedEditProfileName !== profileBeingEdited?.name || editProfileIcon !== profileBeingEdited?.icon);
  const canSaveProfileEdit =
    Boolean(profileBeingEdited) &&
    trimmedEditProfileName.length > 0 &&
    hasProfileEditChanges &&
    !isSavingProfileEdit;
  const hasUnsavedChanges =
    profileSnapshot.preferredName !== preferredName ||
    profileSnapshot.occupation !== occupation ||
    profileSnapshot.traits.join(", ") !== traits.join(", ") ||
    profileSnapshot.about !== about;

  const updateDraft = (updater: (current: CustomizationDraft) => CustomizationDraft) => {
    setDraft((previousDraft) => updater(previousDraft ?? profileSnapshot));
  };

  // Reset draft when profile changes
  useEffect(() => {
    setDraft(null);
  }, [activeProfile?._id]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const shouldInterceptAnchor = useCallback((anchor: HTMLAnchorElement): string | null => {
    if (!anchor.href || anchor.target === "_blank") {
      return null;
    }

    const url = anchor.getAttribute("href") || anchor.href;
    if (url?.startsWith("/")) {
      return url;
    }

    return null;
  }, []);

  const handleNavigationAttempt = useCallback(
    (url: string, e: MouseEvent) => {
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setTimeout(() => {
        setPendingUrl(url);
        setShowUnsavedChangesDialog(true);
      }, 0);
    },
    [setPendingUrl, setShowUnsavedChangesDialog],
  );

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }

      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) {
        return;
      }

      const url = shouldInterceptAnchor(anchor);
      if (url) {
        handleNavigationAttempt(url, e);
      }
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasUnsavedChanges, shouldInterceptAnchor, handleNavigationAttempt]);

  const handleSave = async () => {
    if (!activeProfile) {
      return;
    }
    await updateProfile({
      profileId: activeProfile._id,
      updates: {
        preferredName,
        occupation,
        traits: traits.join(", "),
        about,
      },
    });
    setDraft(null);
    toast({ title: "Preferences saved", status: "success" });
  };

  const handleAddTrait = (trait: string) => {
    if (trait && !traits.includes(trait) && traits.length < 50) {
      updateDraft((current) => ({
        ...current,
        traits: [...current.traits, trait],
      }));
    }
  };

  const handleRemoveTrait = (traitToRemove: string) => {
    updateDraft((current) => ({
      ...current,
      traits: current.traits.filter((trait) => trait !== traitToRemove),
    }));
  };

  const handleTraitInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTraitInput(e.target.value);
  };

  const handleTraitInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      handleAddTrait(traitInput);
      setTraitInput("");
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && hasUnsavedChanges) {
      e.preventDefault();
      void handleSave();
    }
  };

  const handleFontChange = (category: FontCategory, fontOption: FontOption): void => {
    updateFont(category, fontOption);
  };

  const handleOpenEditProfile = (profile: Profile) => {
    setIsProfileSelectOpen(false);
    setEditProfileId(profile._id);
    setEditProfileName(profile.name);
    setEditProfileIcon(isProfileIconName(profile.icon) ? profile.icon : PROFILE_ICONS[0]);
  };

  const handleDeleteFromDropdown = (profile: Profile) => {
    if (profile.isDefault) {
      return;
    }
    setIsProfileSelectOpen(false);
    setDeleteConfirmProfileId(profile._id);
  };

  const closeEditDialog = () => {
    setEditProfileId(null);
    setEditProfileName("");
    setEditProfileIcon(PROFILE_ICONS[0]);
    setIsSavingProfileEdit(false);
  };

  const handleSaveProfileEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!profileBeingEdited || !canSaveProfileEdit) {
      return;
    }

    try {
      setIsSavingProfileEdit(true);
      await updateProfile({
        profileId: profileBeingEdited._id,
        updates: {
          name: trimmedEditProfileName,
          icon: editProfileIcon,
        },
      });
      toast({ title: "Profile updated", status: "success" });
      closeEditDialog();
    } catch {
      toast({ title: "Failed to update profile", status: "error" });
    } finally {
      setIsSavingProfileEdit(false);
    }
  };

  const defaultTraits = [
    "friendly",
    "witty",
    "concise",
    "curious",
    "empathetic",
    "creative",
    "patient",
  ];

  return (
    <div className="space-y-8">
      {/* Profile Section */}
      {profiles.length > 0 && (
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
                      <SelectItem className="pr-16 [&>span.absolute]:hidden" key={p._id} value={p._id}>
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
                              handleOpenEditProfile(p);
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
        </>
      )}

      {/* Customization Header */}
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-semibold text-2xl tracking-tight">Customization</h1>
          {Boolean(hasUnsavedChanges) && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600 text-xs dark:text-amber-400">
              Unsaved changes
            </span>
          )}
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Personalize how {APP_NAME} interacts with you. Set your preferences for a more tailored
          experience.
        </p>
      </header>

      {/* Personal Information Section */}
      <section className="space-y-6">
        {/* Preferred Name */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-medium text-sm" htmlFor="preferred-name">
              What should {APP_NAME} call you?
            </Label>
            <span className="text-muted-foreground text-xs">{preferredName.length}/50</span>
          </div>
          <Input
            id="preferred-name"
            maxLength={50}
            onChange={(e) => {
              const nextPreferredName = e.target.value;
              updateDraft((current) => ({
                ...current,
                preferredName: nextPreferredName,
              }));
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Enter your name…"
            value={preferredName}
          />
        </div>

        {/* Occupation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-medium text-sm" htmlFor="occupation">
              What do you do?
            </Label>
            <span className="text-muted-foreground text-xs">{occupation.length}/100</span>
          </div>
          <Input
            id="occupation"
            maxLength={100}
            onChange={(e) => {
              const nextOccupation = e.target.value;
              updateDraft((current) => ({
                ...current,
                occupation: nextOccupation,
              }));
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Engineer, student, etc…"
            value={occupation}
          />
        </div>

        {/* Traits */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-medium text-sm" htmlFor="traits-input">
              What traits should {APP_NAME} have?
            </Label>
            <span className="text-muted-foreground text-xs">{traits.length}/50</span>
          </div>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
            {traits.map((trait) => (
              <Badge
                className="flex h-6 items-center gap-1 rounded-md border-0 bg-primary/10 px-2 text-primary text-xs"
                key={trait}
                variant="secondary"
              >
                {trait}
                <button
                  className="ml-0.5 cursor-pointer rounded-sm text-primary/60 hover:bg-primary/20 hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTrait(trait);
                  }}
                  type="button"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <input
              className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              id="traits-input"
              maxLength={50}
              onChange={handleTraitInputChange}
              onKeyDown={handleTraitInputKeyDown}
              placeholder={traits.length === 0 ? "Type a trait and press Enter…" : ""}
              type="text"
              value={traitInput}
            />
          </div>
          {Boolean(defaultTraits.filter((trait) => !traits.includes(trait)).length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {defaultTraits
                .filter((trait) => !traits.includes(trait))
                .map((trait) => (
                  <button
                    className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border bg-background px-2 text-muted-foreground text-xs hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                    key={trait}
                    onClick={() => {
                      handleAddTrait(trait);
                    }}
                    type="button"
                  >
                    {trait}
                    <Plus className="size-3" />
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* About */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-medium text-sm" htmlFor="about">
              Anything else {APP_NAME} should know about you?
            </Label>
            <span className="text-muted-foreground text-xs">{about.length}/3000</span>
          </div>
          <Textarea
            className="min-h-[120px] resize-none"
            id="about"
            maxLength={3000}
            onChange={(e) => {
              const nextAbout = e.target.value;
              updateDraft((current) => ({
                ...current,
                about: nextAbout,
              }));
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Interests, values, or preferences to keep in mind…"
            rows={5}
            value={about}
          />
        </div>

        <div className="flex justify-end">
          <Button className="cursor-pointer" disabled={!hasUnsavedChanges} onClick={handleSave}>
            Save Preferences
          </Button>
        </div>
      </section>

      {/* Visual Options Section */}
      <section className="space-y-4">
        <h1 className="font-semibold text-2xl tracking-tight">Visual Options</h1>

        {/* Theme Card */}
        <div className="rounded-xl border bg-card p-4">
          <div className="space-y-3">
            <div>
              <Label className="font-medium text-sm" htmlFor="theme-selector">
                Theme
              </Label>
              <p className="mt-1 text-muted-foreground text-xs">
                Choose a visual theme that affects the overall appearance and color scheme.
              </p>
            </div>
            <ThemeSelector />
          </div>
        </div>

        {/* Font Controls */}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_480px]">
          <div className="min-w-0 rounded-xl border bg-card p-4">
            <ThemeFontControls
              onFontChange={handleFontChange}
              themeStyles={themeState.styles[themeState.currentMode]}
            />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Fonts Preview</h3>
              <div className="rounded-lg border border-dashed bg-background p-4">
                <div>
                  {/* User message (right aligned) */}
                  <div className="flex justify-end">
                    <div className="inline-block max-w-[78%] whitespace-pre-line break-words rounded-xl bg-accent px-5 py-2.5 text-left font-sans leading-relaxed shadow-sm">
                      Can you write me a simple hello world program?
                    </div>
                  </div>
                  {/* Assistant message (left aligned) */}
                  <div className="mt-4">
                    <div className="mb-2 font-sans leading-relaxed">Sure, here you go:</div>
                    <div className="relative flex w-full flex-col pt-9">
                      <div className="absolute inset-x-0 top-0 flex h-9 items-center rounded-t bg-secondary px-4 py-2 text-secondary-foreground text-sm">
                        <span className="font-mono lowercase">python</span>
                      </div>
                      <CodeBlock className="not-prose border-none bg-transparent p-0 shadow-none">
                        <CodeBlockCode
                          className="[&_code]:!font-mono [&_pre]:!bg-transparent [&_pre]:!font-mono font-mono text-sm [&_pre]:overflow-auto [&_pre]:px-4 [&_pre]:py-4"
                          code={
                            'def greet(name):\n    print(f"Hello, {name}!")\n\nif __name__ == "__main__":\n    greet("world")'
                          }
                          language="python"
                        />
                      </CodeBlock>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeEditDialog();
          }
        }}
        open={Boolean(profileBeingEdited)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          {profileBeingEdited && (
            <form onSubmit={handleSaveProfileEdit}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label className="text-sm" htmlFor="edit-profile-name">
                    Name
                  </Label>
                  <div className="flex gap-2">
                    <ProfileIconPicker onChange={setEditProfileIcon} value={editProfileIcon} />
                    <Input
                      id="edit-profile-name"
                      maxLength={50}
                      onChange={(e) => setEditProfileName(e.target.value)}
                      placeholder="Work, Personal, etc."
                      value={editProfileName}
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                <Button
                  className="cursor-pointer"
                  onClick={closeEditDialog}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button className="cursor-pointer" disabled={!canSaveProfileEdit} type="submit">
                  {isSavingProfileEdit ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Dialog */}
      <AlertDialog onOpenChange={setShowUnsavedChangesDialog} open={showUnsavedChangesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingUrl(null)}>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingUrl) {
                  setDraft(null);
                  setShowUnsavedChangesDialog(false);
                  void router.navigate({ to: pendingUrl });
                }
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Profile Confirmation Dialog */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmProfileId(null);
          }
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
                if (!deleteConfirmProfileId) {
                  return;
                }
                try {
                  await deleteProfileMutation({
                    profileId: deleteConfirmProfileId,
                  });
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
    </div>
  );
}

import { useBlocker } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { APP_NAME } from "@/lib/config";
import type { Profile } from "@/providers/profile-provider";
import { useProfile } from "@/providers/profile-provider";
import { TraitsEditor } from "./traits-editor";
import { UnsavedChangesDialog } from "./unsaved-changes-dialog";

interface CustomizationDraft {
  preferredName: string;
  occupation: string;
  traits: string[];
  about: string;
}

function getProfileCustomizationSnapshot(
  profile: Profile | undefined,
  user: { preferredName?: string; occupation?: string; traits?: string; about?: string } | null,
): CustomizationDraft {
  const source = profile ?? user;
  return {
    preferredName: source?.preferredName ?? "",
    occupation: source?.occupation ?? "",
    traits: source?.traits ? source.traits.split(", ") : [],
    about: source?.about ?? "",
  };
}

interface PersonalizationSectionProps {
  activeProfile: Profile | undefined;
  user: { preferredName?: string; occupation?: string; traits?: string; about?: string } | null;
}

interface MissingProfileDraftParams {
  draftProfileId: string | undefined;
  profileIds: readonly string[];
  isProfilesLoading: boolean;
}

interface PersonalizationSectionContentProps {
  about: string;
  dialogOpen: boolean;
  draftBelongsToPreviousProfile: boolean;
  hasUnsavedChanges: boolean;
  occupation: string;
  preferredName: string;
  traits: string[];
  onAboutChange: (value: string) => void;
  onAddTrait: (trait: string) => void;
  onDialogCancel: () => void;
  onDialogDiscard: () => void;
  onInputKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onOccupationChange: (value: string) => void;
  onPreferredNameChange: (value: string) => void;
  onRemoveTrait: (trait: string) => void;
  onSave: () => void;
}

export function shouldDiscardDraftForMissingProfile({
  draftProfileId,
  profileIds,
  isProfilesLoading,
}: MissingProfileDraftParams): boolean {
  if (!draftProfileId || isProfilesLoading) {
    return false;
  }

  return !profileIds.includes(draftProfileId);
}

function PersonalizationSectionContent({
  about,
  dialogOpen,
  draftBelongsToPreviousProfile,
  hasUnsavedChanges,
  occupation,
  preferredName,
  traits,
  onAboutChange,
  onAddTrait,
  onDialogCancel,
  onDialogDiscard,
  onInputKeyDown,
  onOccupationChange,
  onPreferredNameChange,
  onRemoveTrait,
  onSave,
}: PersonalizationSectionContentProps) {
  return (
    <>
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-semibold text-2xl tracking-tight">Customization</h1>
          {hasUnsavedChanges && (
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

      <section className="space-y-6">
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
            onChange={(event) => {
              onPreferredNameChange(event.target.value);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Enter your name…"
            value={preferredName}
          />
        </div>

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
            onChange={(event) => {
              onOccupationChange(event.target.value);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Engineer, student, etc…"
            value={occupation}
          />
        </div>

        <TraitsEditor traits={traits} onAdd={onAddTrait} onRemove={onRemoveTrait} />

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
            onChange={(event) => {
              onAboutChange(event.target.value);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Interests, values, or preferences to keep in mind…"
            rows={5}
            value={about}
          />
        </div>

        <div className="flex items-center justify-end gap-3">
          {draftBelongsToPreviousProfile && (
            <span className="text-muted-foreground text-xs">
              Unsaved changes belong to previous profile; save will apply there.
            </span>
          )}
          <Button className="cursor-pointer" disabled={!hasUnsavedChanges} onClick={onSave}>
            Save Preferences
          </Button>
        </div>
      </section>

      <UnsavedChangesDialog
        open={dialogOpen}
        onCancel={onDialogCancel}
        onDiscard={onDialogDiscard}
      />
    </>
  );
}

export function PersonalizationSection({ activeProfile, user }: PersonalizationSectionProps) {
  const updateProfile = useMutation(api.profiles.updateProfile);
  const updateUserProfile = useMutation(api.users.updateUserProfile);
  const {
    profiles,
    isProfilesLoading,
    pendingSwitch,
    executePendingSwitch,
    clearPendingSwitch,
    registerBeforeProfileSwitch,
    unregisterBeforeProfileSwitch,
  } = useProfile();

  const profileSnapshot = getProfileCustomizationSnapshot(activeProfile, user);
  const [draftState, setDraftState] = useState<{
    draft: CustomizationDraft | null;
    profileId: Id<"profiles"> | undefined;
  }>({ draft: null, profileId: activeProfile?._id });

  const { draft } = draftState;
  // When no draft is active, always use the current activeProfile id
  // (avoids stale undefined from initial state before profiles load).
  const draftProfileId = draft ? draftState.profileId : activeProfile?._id;
  const profileIds = useMemo(() => profiles.map((profile) => profile._id), [profiles]);
  const currentValues = draft ?? profileSnapshot;
  const { preferredName, occupation, traits, about } = currentValues;
  const hasUnsavedChanges =
    profileSnapshot.preferredName !== preferredName ||
    profileSnapshot.occupation !== occupation ||
    profileSnapshot.traits.join(", ") !== traits.join(", ") ||
    profileSnapshot.about !== about;

  // Route navigation blocker (intercepts router.navigate, <Link>, back/forward, beforeunload)
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
    enableBeforeUnload: () => hasUnsavedChanges,
    withResolver: true,
  });

  // Profile switch guard (intercepts setActiveProfile calls from sidebar/dropdown)
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  });
  const guardFn = useCallback(() => !hasUnsavedChangesRef.current, []);
  useEffect(() => {
    registerBeforeProfileSwitch(guardFn);
    return unregisterBeforeProfileSwitch;
  }, [guardFn, registerBeforeProfileSwitch, unregisterBeforeProfileSwitch]);

  // Unified dialog — open when route blocked OR profile switch pending
  const dialogOpen = status === "blocked" || pendingSwitch !== null;
  const handleDialogCancel = () => {
    if (status === "blocked") reset();
    clearPendingSwitch();
  };
  const handleDialogDiscard = () => {
    setDraftState((prev) => ({ ...prev, draft: null }));
    if (status === "blocked") proceed();
    if (pendingSwitch) executePendingSwitch();
  };

  const updateDraft = (updater: (current: CustomizationDraft) => CustomizationDraft) => {
    setDraftState((prev) => ({
      draft: updater(prev.draft ?? profileSnapshot),
      // Preserve original draft ownership across profile switches until save succeeds.
      // If activeProfile hasn't resolved yet, keep the previous profileId to avoid
      // capturing undefined as the owner (which would route saves to the global user row).
      profileId: prev.draft ? prev.profileId : (activeProfile?._id ?? prev.profileId),
    }));
  };

  // Sync draft ref in effect (not render) to satisfy React Compiler
  const draftRef = useRef<CustomizationDraft | null>(null);
  useEffect(() => {
    draftRef.current = draft;
  });
  useEffect(() => {
    if (activeProfile?._id === draftProfileId) return;

    const currentDraft = draftRef.current;
    if (!currentDraft) return;

    let stale = false;

    const updates = {
      preferredName: currentDraft.preferredName,
      occupation: currentDraft.occupation,
      traits: currentDraft.traits.join(", "),
      about: currentDraft.about,
    };

    const targetProfileId = draftProfileId ?? activeProfile?._id;
    const shouldDiscardDraft = shouldDiscardDraftForMissingProfile({
      draftProfileId: targetProfileId,
      profileIds,
      isProfilesLoading,
    });
    if (shouldDiscardDraft) {
      queueMicrotask(() => {
        if (stale) return;
        setDraftState({ draft: null, profileId: activeProfile?._id });
      });
      toast({
        title: "Unsaved preferences were discarded because the profile was deleted",
        status: "info",
      });
      return () => {
        stale = true;
      };
    }

    const savePromise = targetProfileId
      ? updateProfile({ profileId: targetProfileId, updates })
      : updateUserProfile({ updates });

    savePromise
      .then(() => {
        if (stale) return;
        setDraftState({ draft: null, profileId: activeProfile?._id });
      })
      .catch(() => {
        if (stale) return;
        toast({ title: "Failed to save preferences for previous profile", status: "error" });
      });

    return () => {
      stale = true;
    };
  }, [
    activeProfile?._id,
    draftProfileId,
    isProfilesLoading,
    profileIds,
    updateProfile,
    updateUserProfile,
  ]);

  const draftBelongsToPreviousProfile = draft !== null && draftProfileId !== activeProfile?._id;

  const handlePreferredNameChange = (nextPreferredName: string) => {
    updateDraft((current) => ({
      ...current,
      preferredName: nextPreferredName,
    }));
  };

  const handleOccupationChange = (nextOccupation: string) => {
    updateDraft((current) => ({
      ...current,
      occupation: nextOccupation,
    }));
  };

  const handleAboutChange = (nextAbout: string) => {
    updateDraft((current) => ({
      ...current,
      about: nextAbout,
    }));
  };

  const handleSave = async () => {
    const nextProfileId = activeProfile?._id;
    const shouldDiscardDraft = shouldDiscardDraftForMissingProfile({
      draftProfileId,
      profileIds,
      isProfilesLoading,
    });
    if (shouldDiscardDraft) {
      setDraftState({ draft: null, profileId: nextProfileId });
      toast({
        title: "Unsaved preferences were discarded because the profile was deleted",
        status: "info",
      });
      return;
    }

    const updates = {
      preferredName,
      occupation,
      traits: traits.join(", "),
      about,
    };
    try {
      if (draftProfileId) {
        await updateProfile({ profileId: draftProfileId, updates });
      } else {
        await updateUserProfile({ updates });
      }
      setDraftState({ draft: null, profileId: nextProfileId });
      toast({ title: "Preferences saved", status: "success" });
    } catch {
      toast({ title: "Failed to save preferences", status: "error" });
    }
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || !hasUnsavedChanges) return;
    const isTextarea = e.currentTarget instanceof HTMLTextAreaElement;
    if (isTextarea && !e.metaKey && !e.ctrlKey) return;
    e.preventDefault();
    void handleSave();
  };

  return (
    <PersonalizationSectionContent
      about={about}
      dialogOpen={dialogOpen}
      draftBelongsToPreviousProfile={draftBelongsToPreviousProfile}
      hasUnsavedChanges={hasUnsavedChanges}
      occupation={occupation}
      onAboutChange={handleAboutChange}
      onAddTrait={handleAddTrait}
      onDialogCancel={handleDialogCancel}
      onDialogDiscard={handleDialogDiscard}
      onInputKeyDown={handleInputKeyDown}
      onOccupationChange={handleOccupationChange}
      onPreferredNameChange={handlePreferredNameChange}
      onRemoveTrait={handleRemoveTrait}
      onSave={handleSave}
      preferredName={preferredName}
      traits={traits}
    />
  );
}

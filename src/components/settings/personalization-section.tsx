import { Plus, X } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { APP_NAME } from "@/lib/config";
import type { Profile } from "@/providers/profile-provider";

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

const DEFAULT_TRAITS = [
  "friendly",
  "witty",
  "concise",
  "curious",
  "empathetic",
  "creative",
  "patient",
];

interface PersonalizationSectionProps {
  activeProfile: Profile | undefined;
  user: { preferredName?: string; occupation?: string; traits?: string; about?: string } | null;
}

export function PersonalizationSection({ activeProfile, user }: PersonalizationSectionProps) {
  const updateProfile = useMutation(api.profiles.updateProfile);
  const updateUserProfile = useMutation(api.users.updateUserProfile);
  const router = useRouter();

  const profileSnapshot = getProfileCustomizationSnapshot(activeProfile, user);
  const [draft, setDraft] = useState<CustomizationDraft | null>(null);
  const [draftProfileId, setDraftProfileId] = useState<string | undefined>(activeProfile?._id);
  const [traitInput, setTraitInput] = useState("");
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const currentValues = draft ?? profileSnapshot;
  const { preferredName, occupation, traits, about } = currentValues;
  const hasUnsavedChanges =
    profileSnapshot.preferredName !== preferredName ||
    profileSnapshot.occupation !== occupation ||
    profileSnapshot.traits.join(", ") !== traits.join(", ") ||
    profileSnapshot.about !== about;

  const updateDraft = (updater: (current: CustomizationDraft) => CustomizationDraft) => {
    setDraft((previousDraft) => updater(previousDraft ?? profileSnapshot));
  };

  // Auto-save dirty draft to previous profile before resetting
  if (activeProfile?._id !== draftProfileId) {
    if (draft) {
      const updates = {
        preferredName: draft.preferredName,
        occupation: draft.occupation,
        traits: draft.traits.join(", "),
        about: draft.about,
      };
      if (draftProfileId) {
        void updateProfile({
          profileId: draftProfileId as Id<"profiles">,
          updates,
        });
      } else {
        void updateUserProfile({ updates });
      }
    }
    setDraftProfileId(activeProfile?._id);
    setDraft(null);
  }

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
      }, 0);
    },
    [setPendingUrl],
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
    try {
      if (activeProfile) {
        await updateProfile({
          profileId: activeProfile._id,
          updates: {
            preferredName,
            occupation,
            traits: traits.join(", "),
            about,
          },
        });
      } else {
        await updateUserProfile({
          updates: {
            preferredName,
            occupation,
            traits: traits.join(", "),
            about,
          },
        });
      }
      setDraft(null);
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
    if (e.key === "Enter" && hasUnsavedChanges) {
      e.preventDefault();
      void handleSave();
    }
  };

  const availableTraits = DEFAULT_TRAITS.filter((trait) => !traits.includes(trait));

  return (
    <>
      {/* Customization Header */}
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
              onChange={(e) => setTraitInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  handleAddTrait(traitInput);
                  setTraitInput("");
                }
              }}
              placeholder={traits.length === 0 ? "Type a trait and press Enter…" : ""}
              type="text"
              value={traitInput}
            />
          </div>
          {availableTraits.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableTraits.map((trait) => (
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

      {/* Unsaved Changes Dialog */}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingUrl(null);
        }}
        open={Boolean(pendingUrl)}
      >
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
                  setPendingUrl(null);
                  void router.navigate({ to: pendingUrl });
                }
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import {
  Architects_Daughter,
  Atkinson_Hyperlegible,
  Atkinson_Hyperlegible_Mono,
  DM_Sans,
  Fira_Mono,
  IBM_Plex_Mono,
  Inter,
  JetBrains_Mono,
  Open_Sans,
  Space_Grotesk,
} from "next/font/google";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/app/providers/user-provider";
import { CodeBlock, CodeBlockCode } from "@/components/prompt-kit/code-block";
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
import { ThemeFontControls } from "@/components/ui/theme-font-controls";
import { ThemeSelector } from "@/components/ui/theme-selector";
import { cn } from "@/lib/utils";

// Load non-default fonts only on the customization page, without preloading
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});
const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});
const architectsDaughter = Architects_Daughter({
  variable: "--font-architects-daughter",
  subsets: ["latin"],
  weight: "400",
  preload: false,
  display: "swap",
});
const atkinsonHyperlegible = Atkinson_Hyperlegible({
  variable: "--font-atkinson-hyperlegible",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
  display: "swap",
});
const atkinsonHyperlegibleMono = Atkinson_Hyperlegible_Mono({
  variable: "--font-atkinson-hyperlegible-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace"],
});
const firaMono = Fira_Mono({
  variable: "--font-fira-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  preload: false,
  display: "swap",
});

import { toast } from "@/components/ui/toast";
import { APP_NAME } from "@/lib/config";
import { useEditorStore } from "@/lib/store/editor-store";
import type { FontCategory, FontOption } from "@/lib/theme/theme-fonts";

export default function CustomizationPage() {
  const { user, updateUser } = useUser();
  const router = useRouter();
  // Use selector functions to only subscribe to the specific parts we need
  const themeState = useEditorStore((state) => state.themeState);
  const updateFont = useEditorStore((state) => state.updateFont);

  const [preferredName, setPreferredName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [traits, setTraits] = useState<string[]>([]);
  const [about, setAbout] = useState("");
  const [traitInput, setTraitInput] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] =
    useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setPreferredName(user.preferredName || "");
      setOccupation(user.occupation || "");
      setTraits(user.traits ? user.traits.split(", ") : []);
      setAbout(user.about || "");
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      const initialTraits = user.traits ? user.traits.split(", ") : [];
      const hasChanges =
        (user.preferredName || "") !== preferredName ||
        (user.occupation || "") !== occupation ||
        initialTraits.join(", ") !== traits.join(", ") ||
        (user.about || "") !== about;
      setHasUnsavedChanges(hasChanges);
    }
  }, [user, preferredName, occupation, traits, about]);

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

  // Helper function to check if an anchor should trigger unsaved changes dialog
  const shouldInterceptAnchor = useCallback(
    (anchor: HTMLAnchorElement): string | null => {
      if (!anchor.href || anchor.target === "_blank") {
        return null;
      }

      const url = anchor.getAttribute("href") || anchor.href;
      if (url?.startsWith("/")) {
        return url;
      }

      return null;
    },
    []
  );

  // Helper function to handle navigation with unsaved changes
  const handleNavigationAttempt = useCallback((url: string, e: MouseEvent) => {
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setTimeout(() => {
      setPendingUrl(url);
      setShowUnsavedChangesDialog(true);
    }, 0);
  }, []);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }

      const anchor = (e.target as HTMLElement).closest(
        "a"
      ) as HTMLAnchorElement | null;
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
    await updateUser({
      preferredName,
      occupation,
      traits: traits.join(", "),
      about,
    });
    setHasUnsavedChanges(false);
    toast({ title: "Preferences saved", status: "success" });
  };

  const handleAddTrait = (trait: string) => {
    if (trait && !traits.includes(trait) && traits.length < 50) {
      setTraits([...traits, trait]);
    }
  };

  const handleRemoveTrait = (traitToRemove: string) => {
    setTraits(traits.filter((trait) => trait !== traitToRemove));
  };

  const handleTraitInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTraitInput(e.target.value);
  };

  const handleTraitInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      handleAddTrait(traitInput);
      setTraitInput("");
    }
  };

  const handleInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && hasUnsavedChanges) {
      e.preventDefault();
      handleSave();
    }
  };

  const handleFontChange = (
    category: FontCategory,
    fontOption: FontOption
  ): void => {
    updateFont(category, fontOption);
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

  // Ensure the non-default font CSS variables are present on this route only
  const pageFontVars = cn(
    inter.variable,
    spaceGrotesk.variable,
    openSans.variable,
    dmSans.variable,
    architectsDaughter.variable,
    atkinsonHyperlegible.variable,
    atkinsonHyperlegibleMono.variable,
    firaMono.variable,
    jetbrainsMono.variable,
    ibmPlexMono.variable
  );

  return (
    <div className="w-full">
      {/* Hidden span carries route-scoped font variable classes without preloading */}
      <span aria-hidden className={pageFontVars} />
      <div className="space-y-8">
        <div>
          <h1 className="font-bold text-2xl">Customize {APP_NAME}</h1>
        </div>
        <div className="space-y-6">
          <div>
            <div className="flex justify-between">
              <Label
                className="mb-2 block font-medium text-base"
                htmlFor="preferred-name"
              >
                What should {APP_NAME} call you?
              </Label>
              <span className="text-muted-foreground text-sm">
                {preferredName.length}/50
              </span>
            </div>
            <Input
              id="preferred-name"
              maxLength={50}
              onChange={(e) => {
                setPreferredName(e.target.value);
                setHasUnsavedChanges(true);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Enter your name"
              value={preferredName}
            />
          </div>
          <div>
            <div className="flex justify-between">
              <Label
                className="mb-2 block font-medium text-base"
                htmlFor="occupation"
              >
                What do you do?
              </Label>
              <span className="text-muted-foreground text-sm">
                {occupation.length}/100
              </span>
            </div>
            <Input
              id="occupation"
              maxLength={100}
              onChange={(e) => {
                setOccupation(e.target.value);
                setHasUnsavedChanges(true);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Engineer, student, etc."
              value={occupation}
            />
          </div>
          <div>
            <div className="flex justify-between">
              <Label
                className="mb-2 block font-medium text-base"
                htmlFor="traits-input"
              >
                What traits should {APP_NAME} have?{" "}
                <span className="ml-2 font-normal text-muted-foreground text-xs">
                  (up to 50, max 100 chars each)
                </span>
              </Label>
              <span className="text-muted-foreground text-sm">
                {traits.length}/50
              </span>
            </div>
            <div className="rounded-lg border p-2">
              <div className="mb-2 flex flex-wrap gap-2">
                {traits.map((trait) => (
                  <Badge
                    className="flex items-center gap-1 rounded-full bg-muted text-foreground hover:bg-muted/80"
                    key={trait}
                    variant="secondary"
                  >
                    <span>{trait}</span>
                    <button
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        handleRemoveTrait(trait);
                        setHasUnsavedChanges(true);
                      }}
                      type="button"
                    >
                      &times;
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                className="border-none bg-transparent focus:ring-0"
                id="traits-input"
                maxLength={50}
                onChange={handleTraitInputChange}
                onKeyDown={handleTraitInputKeyDown}
                placeholder="Type a trait and press Enter or Tab..."
                value={traitInput}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {defaultTraits
                .filter((trait) => !traits.includes(trait))
                .map((trait) => (
                  <Button
                    key={trait}
                    onClick={() => {
                      handleAddTrait(trait);
                      setHasUnsavedChanges(true);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {trait} +
                  </Button>
                ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between">
              <Label
                className="mb-2 block font-medium text-base"
                htmlFor="about"
              >
                Anything else {APP_NAME} should know about you?
              </Label>
              <span className="text-muted-foreground text-sm">
                {about.length}/3000
              </span>
            </div>
            <Textarea
              className="max-h-48"
              id="about"
              maxLength={3000}
              onChange={(e) => {
                setAbout(e.target.value);
                setHasUnsavedChanges(true);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Interests, values, or preferences to keep in mind"
              rows={5}
              value={about}
            />
          </div>
          <div className="flex justify-end gap-4">
            <Button disabled={!hasUnsavedChanges} onClick={handleSave}>
              Save Preferences
            </Button>
          </div>
          <div>
            <h2 className="font-bold text-2xl">Visual Options</h2>
            <div className="mt-8 space-y-6">
              <div>
                <Label
                  className="mb-2 block font-medium text-base"
                  htmlFor="theme-selector"
                >
                  Theme
                </Label>
                <p className="mb-3 text-muted-foreground text-sm">
                  Choose a visual theme that affects the overall appearance and
                  color scheme.
                </p>
                <ThemeSelector />
              </div>
              <div>
                <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-[1fr_480px]">
                  <div className="min-w-0">
                    <ThemeFontControls
                      onFontChange={handleFontChange}
                      themeStyles={themeState.styles[themeState.currentMode]}
                    />
                  </div>
                  <div className="min-h-full">
                    <div className="space-y-3">
                      <h3 className="font-medium text-base">Fonts Preview</h3>
                      <div className="rounded-lg border border-input border-dashed p-4">
                        <div>
                          {/* User message (right aligned) */}
                          <div className="flex justify-end">
                            <div className="inline-block max-w-[78%] whitespace-pre-line break-words rounded-xl bg-accent px-5 py-2.5 text-left font-sans leading-relaxed shadow-sm">
                              Can you write me a simple hello world program?
                            </div>
                          </div>
                          {/* Assistant message (left aligned) */}
                          <div className="mt-4">
                            <div className="mb-2 font-sans leading-relaxed">
                              Sure, here you go:
                            </div>
                            <div className="relative flex w-full flex-col pt-9">
                              <div className="absolute inset-x-0 top-0 flex h-9 items-center rounded-t bg-secondary px-4 py-2 text-secondary-foreground text-sm">
                                <span className="font-mono lowercase">
                                  python
                                </span>
                              </div>
                              <CodeBlock className="not-prose border-none bg-transparent p-0 shadow-none">
                                <CodeBlockCode
                                  className="[&_pre]:!bg-transparent font-mono text-sm [&_pre]:overflow-auto [&_pre]:px-4 [&_pre]:py-4"
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
              </div>
            </div>
          </div>
        </div>
      </div>
      <AlertDialog
        onOpenChange={setShowUnsavedChangesDialog}
        open={showUnsavedChangesDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingUrl(null)}>
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingUrl) {
                  setHasUnsavedChanges(false);
                  setShowUnsavedChangesDialog(false);
                  router.push(pendingUrl);
                }
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

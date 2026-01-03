import {
  BrainIcon,
  CheckIcon,
  EyeIcon,
  FilePdfIcon,
  FunnelIcon,
  ImagesIcon,
  KeyIcon,
  LinkIcon,
  SketchLogoIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ProviderIcon } from "@/components/common/provider-icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useModelPreferences } from "@/hooks/use-model-preferences";
import { useModelSettings } from "@/hooks/use-model-settings";
import {
  APP_BASE_URL,
  MODEL_DEFAULT,
  MODELS_OPTIONS,
  PROVIDERS_OPTIONS,
  RECOMMENDED_MODELS,
} from "@/lib/config";
import { cn } from "@/lib/utils";

const modelsSearchSchema = z.object({
  tier: z.enum(["free", "premium"]).optional(),
  features: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/settings/models")({
  validateSearch: modelsSearchSchema,
  component: ModelsSettingsPage,
});

interface FeatureInfo {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FEATURE_INFO: Record<string, FeatureInfo> = {
  "file-upload": {
    label: "Vision",
    icon: EyeIcon,
  },
  "pdf-processing": {
    label: "PDF Comprehension",
    icon: FilePdfIcon,
  },
  reasoning: {
    label: "Reasoning",
    icon: BrainIcon,
  },
  "tool-calling": {
    label: "Tool Calling",
    icon: WrenchIcon,
  },
  "image-generation": {
    label: "Image Generation",
    icon: ImagesIcon,
  },
};

const getFeatureColorClasses = (featureId: string) => {
  switch (featureId) {
    case "file-upload":
      return "text-teal-600 dark:text-teal-400";
    case "pdf-processing":
      return "text-indigo-600 dark:text-indigo-400";
    case "reasoning":
      return "text-pink-600 dark:text-pink-400";
    case "tool-calling":
      return "text-blue-600 dark:text-blue-400";
    case "image-generation":
      return "text-orange-600 dark:text-orange-400";
    default:
      return "text-muted-foreground";
  }
};

export function ModelsSettingsPage() {
  const { disabledModelsSet, setModelEnabled, bulkSetModelsDisabled } = useModelSettings();
  const { bulkSetFavoriteModels } = useModelPreferences();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tier, features } = Route.useSearch();

  const filters = useMemo(() => new Set(features ?? []), [features]);
  const freeOnly = tier === "free";
  const premiumOnly = tier === "premium";

  const getDisplayName = (modelName: string, subName?: string) =>
    subName ? `${modelName} (${subName})` : modelName;
  const [disabled, setDisabled] = useState<Set<string>>(disabledModelsSet);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setDisabled(disabledModelsSet);
  }, [disabledModelsSet]);

  const allFeatures = useMemo(() => {
    const f = new Set<string>();
    for (const m of MODELS_OPTIONS) {
      for (const feat of m.features) {
        if (feat.enabled) {
          f.add(feat.id);
        }
      }
    }
    return Array.from(f);
  }, []);

  const isCurrentlyEnabled = (id: string) => !disabled.has(id);

  const filteredModels = useMemo(
    () =>
      MODELS_OPTIONS.filter((m) => {
        if (freeOnly && m.premium) {
          return false;
        }
        if (premiumOnly && !m.premium) {
          return false;
        }
        return Array.from(filters).every((f) =>
          m.features.some((feat) => feat.id === f && feat.enabled),
        );
      }),
    [filters, freeOnly, premiumOnly],
  );

  const enabledCount = MODELS_OPTIONS.length - disabled.size;
  const totalCount = MODELS_OPTIONS.length;

  const handleToggle = async (id: string) => {
    const isCurrentlyDisabled = disabled.has(id);
    const shouldEnable = isCurrentlyDisabled;

    const next = new Set(disabled);
    if (shouldEnable) {
      next.delete(id);
    } else if (id !== MODEL_DEFAULT) {
      next.add(id);
    }
    setDisabled(next);

    try {
      await setModelEnabled({ modelId: id, enabled: shouldEnable });
    } catch (error) {
      console.error(`Failed to ${shouldEnable ? "enable" : "disable"} model:`, error);
      setDisabled(disabled);
      toast.error(`Failed to ${shouldEnable ? "enable" : "disable"} model. Please try again.`);
    }
  };

  const handleRecommended = async () => {
    const modelsToDisable: string[] = [];
    for (const id of MODELS_OPTIONS.map((m) => m.id)) {
      if (!RECOMMENDED_MODELS.includes(id) && id !== MODEL_DEFAULT) {
        modelsToDisable.push(id);
      }
    }

    const originalDisabled = disabled;
    setDisabled(new Set(modelsToDisable));

    try {
      await Promise.all([
        bulkSetModelsDisabled({ modelIds: modelsToDisable }),
        bulkSetFavoriteModels(RECOMMENDED_MODELS),
      ]);
    } catch (error) {
      console.error("Failed to apply recommended models:", error);
      setDisabled(originalDisabled);
      toast.error("Failed to apply recommended models. Please try again.");
    }
  };

  const handleUnselectAll = async () => {
    const allModelIds = MODELS_OPTIONS.map((m) => m.id);

    const originalDisabled = disabled;
    const modelsToDisable = allModelIds.filter((id) => id !== MODEL_DEFAULT);
    setDisabled(new Set(modelsToDisable));

    try {
      await bulkSetModelsDisabled({ modelIds: allModelIds });
      setShowConfirm(false);
    } catch (error) {
      console.error("Failed to unselect all models:", error);
      setDisabled(originalDisabled);
      setShowConfirm(false);
      toast.error("Failed to unselect all models. Please try again.");
    }
  };

  const toggleFilter = (id: string) => {
    const newFeatures = filters.has(id)
      ? Array.from(filters).filter((f) => f !== id)
      : [...Array.from(filters), id];
    void navigate({
      search: { tier, features: newFeatures.length > 0 ? newFeatures : undefined },
    });
  };

  const toggleFree = () => {
    void navigate({
      search: {
        tier: freeOnly ? undefined : "free",
        features: features?.length ? features : undefined,
      },
    });
  };

  const togglePremium = () => {
    void navigate({
      search: {
        tier: premiumOnly ? undefined : "premium",
        features: features?.length ? features : undefined,
      },
    });
  };

  const handleCopy = async (id: string) => {
    try {
      const base = import.meta.env.DEV ? "http://localhost:3000" : APP_BASE_URL;
      const u = new URL(base);
      u.searchParams.set("model", id);
      u.searchParams.set("q", "%s");
      const searchUrl = u.toString().replace("%25s", "%s");
      await navigator.clipboard.writeText(searchUrl);
      setCopied(id);
      setTimeout(() => {
        setCopied((prev) => (prev === id ? null : prev));
      }, 1000);
    } catch {
      toast.error("Failed to copy to clipboard. Please try again.");
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-semibold text-2xl tracking-tight">Models</h1>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs">
              {totalCount} available
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 text-xs dark:text-emerald-400">
              {enabledCount} enabled
            </span>
          </div>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Choose which models appear in your model selector. This won&apos;t affect existing
          conversations.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2" size="sm" variant="outline">
                <FunnelIcon className="size-4" />
                {filters.size > 0 || freeOnly || premiumOnly
                  ? `Filters (${filters.size + (freeOnly ? 1 : 0) + (premiumOnly ? 1 : 0)})`
                  : "Filter"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {allFeatures.map((fid) => {
                const info = FEATURE_INFO[fid];
                if (!info) {
                  return null;
                }
                const Icon = info.icon;
                const checked = filters.has(fid);
                return (
                  <DropdownMenuItem
                    aria-checked={checked}
                    className="flex items-center justify-between"
                    data-state={checked ? "checked" : "unchecked"}
                    key={fid}
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleFilter(fid);
                    }}
                    role="menuitemcheckbox"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "relative flex size-6 items-center justify-center overflow-hidden rounded-md",
                          getFeatureColorClasses(fid),
                        )}
                      >
                        <div className="absolute inset-0 bg-current opacity-20 dark:opacity-15" />
                        <Icon className={cn("relative size-4", getFeatureColorClasses(fid))} />
                      </div>
                      <span>{info.label}</span>
                    </div>
                    <span className="flex size-3.5 items-center justify-center">
                      {checked ? <CheckIcon className="size-4" /> : null}
                    </span>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                aria-checked={freeOnly}
                className="flex items-center justify-between"
                data-state={freeOnly ? "checked" : "unchecked"}
                onSelect={(e) => {
                  e.preventDefault();
                  toggleFree();
                }}
                role="menuitemcheckbox"
              >
                <span>Only show free plan models</span>
                <span className="flex size-3.5 items-center justify-center">
                  {freeOnly ? <CheckIcon className="size-4" /> : null}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                aria-checked={premiumOnly}
                className="flex items-center justify-between"
                data-state={premiumOnly ? "checked" : "unchecked"}
                onSelect={(e) => {
                  e.preventDefault();
                  togglePremium();
                }}
                role="menuitemcheckbox"
              >
                <span>Only show premium plan models</span>
                <span className="flex size-3.5 items-center justify-center">
                  {premiumOnly ? <CheckIcon className="size-4" /> : null}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {(filters.size > 0 || freeOnly || premiumOnly) && (
            <Button
              className="h-8"
              onClick={() => {
                void navigate({ search: {} });
              }}
              size="sm"
              variant="ghost"
            >
              Clear filters
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            className="hidden md:inline-flex"
            onClick={handleRecommended}
            size="sm"
            variant="outline"
          >
            Select Recommended
          </Button>
          <AlertDialog onOpenChange={setShowConfirm} open={showConfirm}>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost">
                Unselect All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unselect All Models?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to unselect all models? Only the default model will remain
                  enabled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleUnselectAll}>Unselect All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filteredModels.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/20 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border-2 border-muted-foreground/30 border-dashed">
              <FunnelIcon className="size-5 text-muted-foreground/60" />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-muted-foreground">No models found</h3>
              <p className="max-w-sm text-muted-foreground/80 text-sm">
                No models match your current filters. Try adjusting your filter criteria.
              </p>
            </div>
            <Button
              onClick={() => {
                void navigate({ search: {} });
              }}
              size="sm"
              variant="outline"
            >
              Clear filters
            </Button>
          </div>
        )}
        {filteredModels.map((model) => {
          const modelWithDisplayProvider = model as typeof model & {
            displayProvider?: string;
          };
          const provider = PROVIDERS_OPTIONS.find(
            (p) => p.id === (modelWithDisplayProvider.displayProvider || model.provider),
          );
          const isEnabled = isCurrentlyEnabled(model.id);

          return (
            <div
              className={cn(
                "group relative flex rounded-xl border bg-card p-4",
                "hover:border-border/80 hover:shadow-sm",
                isEnabled && "border-primary/20 bg-primary/[0.02]",
              )}
              key={model.id}
            >
              <div className="flex w-full items-start gap-4">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background",
                    isEnabled && "border-primary/20",
                  )}
                >
                  {provider ? (
                    <ProviderIcon className="size-5 text-muted-foreground" provider={provider} />
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="font-medium text-sm">
                        {getDisplayName(model.name, model.subName)}
                      </h3>
                      {model.usesPremiumCredits ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center">
                              <SketchLogoIcon className="size-3.5 text-amber-500" weight="fill" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>Premium Model</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                      {model.apiKeyUsage.userKeyOnly ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center">
                              <KeyIcon className="size-3.5 text-muted-foreground" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p>Requires API Key</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                    <Switch checked={isEnabled} onCheckedChange={() => handleToggle(model.id)} />
                  </div>

                  {model.description ? (
                    <div className="space-y-1">
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        {expanded[model.id]
                          ? model.description.replace(/\n/g, " ")
                          : model.description.split("\n")[0]}
                      </p>
                      {model.description.split("\n").length > 1 ? (
                        <button
                          className="cursor-pointer text-muted-foreground text-xs hover:text-foreground"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [model.id]: !prev[model.id],
                            }))
                          }
                          type="button"
                        >
                          {expanded[model.id] ? "Show less" : "Show more"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {model.features.map((feat) => {
                        if (!feat.enabled) {
                          return null;
                        }
                        const info = FEATURE_INFO[feat.id];
                        if (!info) {
                          return null;
                        }
                        const Icon = info.icon;

                        return (
                          <Badge
                            className={cn(
                              "relative flex items-center gap-1 overflow-hidden rounded-full px-1.5 py-0.5 text-[10px]",
                              getFeatureColorClasses(feat.id),
                            )}
                            key={feat.id}
                            variant="outline"
                          >
                            <div className="absolute inset-0 bg-current opacity-20 dark:opacity-15" />
                            <Icon className="relative size-2.5" />
                            <span className="relative whitespace-nowrap">{info.label}</span>
                          </Badge>
                        );
                      })}
                    </div>
                    <button
                      className="hidden h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-muted-foreground text-xs hover:bg-muted hover:text-foreground sm:flex"
                      onClick={() => handleCopy(model.id)}
                      type="button"
                    >
                      {copied === model.id ? (
                        <>
                          <CheckIcon className="size-3" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <LinkIcon className="size-3" />
                          <span>Search URL</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

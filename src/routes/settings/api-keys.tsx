import { Check, Key, Spinner, Trash, Warning } from "@phosphor-icons/react";
import {
  AnthropicDark,
  AnthropicLight,
  Gemini,
  OpenAIDark,
  OpenAILight,
} from "@ridemountainpig/svgl-react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useReducer } from "react";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { api } from "@/convex/_generated/api";
import {
  getApiKeyProviders,
  type ApiKeyProvider as Provider,
  validateApiKey,
} from "@/lib/config/api-keys";
import { cn } from "@/lib/utils";
import { useUser } from "@/providers/user-provider";

export const Route = createFileRoute("/settings/api-keys")({
  component: ApiKeysSettingsPage,
});

const PROVIDERS = getApiKeyProviders();

const PROVIDER_ICONS: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    iconLight?: React.ComponentType<{ className?: string }>;
  }
> = {
  anthropic: { icon: AnthropicDark, iconLight: AnthropicLight },
  openai: { icon: OpenAIDark, iconLight: OpenAILight },
  gemini: { icon: Gemini },
};

function ProviderIcon({ providerId, className }: { providerId: string; className?: string }) {
  const { theme } = useTheme();
  const icons = PROVIDER_ICONS[providerId];
  if (!icons) {
    return <Key className={className} weight="duotone" />;
  }
  const Icon = theme === "light" && icons.iconLight ? icons.iconLight : icons.icon;
  return <Icon className={className} />;
}

function ApiKeyInputForm({
  placeholder,
  docs,
  title,
  validationError,
  isValidating,
  onSave,
  onInputChange,
  value,
}: {
  placeholder: string;
  docs: string;
  title: string;
  validationError?: string;
  isValidating: boolean;
  onSave: () => void;
  onInputChange: (value: string) => void;
  value: string;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !isValidating) {
        e.preventDefault();
        onSave();
      }
    },
    [onSave, isValidating],
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="relative">
          <Input
            className={cn(
              "h-9 bg-background font-mono text-sm",
              validationError && "border-destructive focus-visible:ring-destructive/20",
            )}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            type="password"
            value={value}
          />
        </div>
        {validationError ? (
          <p className="flex items-center gap-1.5 text-destructive text-xs">
            <Warning className="size-3.5 shrink-0" weight="fill" />
            {validationError}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Get your key from{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href={docs}
            rel="noopener noreferrer"
            target="_blank"
          >
            {title.split(" ")[0]} Dashboard
          </a>
        </p>
        <Button
          className="h-8 gap-1.5"
          disabled={isValidating || !value.trim()}
          onClick={onSave}
          size="sm"
        >
          {isValidating ? (
            <>
              <Spinner className="size-3.5 animate-spin" />
              Saving
            </>
          ) : (
            "Save Key"
          )}
        </Button>
      </div>
    </div>
  );
}

function ProviderCard({
  providerConfig,
  savedApiKeys,
  validationErrors,
  isValidating,
  onSave,
  onInputChange,
  onDelete,
  onToggle,
  inputValue,
}: {
  providerConfig: (typeof PROVIDERS)[0];
  savedApiKeys: Array<{ provider: string; mode?: string }>;
  validationErrors: Record<string, string>;
  isValidating: Record<string, boolean>;
  onSave: (provider: Provider) => void;
  onInputChange: (provider: Provider, value: string) => void;
  onDelete: (provider: Provider) => void;
  onToggle: (provider: Provider, checked: boolean) => void;
  inputValue: string;
}) {
  const hasKey = savedApiKeys.some((k) => k.provider === providerConfig.id);
  const isPriority =
    savedApiKeys.find((k) => k.provider === providerConfig.id)?.mode === "priority";

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card p-4",
        "hover:border-border/80 hover:shadow-sm",
        hasKey && "border-primary/20 bg-primary/[0.02]",
        hasKey && isPriority && "ring-1 ring-primary/10",
      )}
    >
      {hasKey ? (
        <div className="absolute top-3 right-3">
          <Badge
            className={cn(
              "gap-1 border-0 py-0.5 text-[10px]",
              isPriority
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-muted text-muted-foreground",
            )}
            variant="secondary"
          >
            {isPriority ? "Priority" : "Fallback"}
          </Badge>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background",
            hasKey && isPriority && "border-primary/20",
          )}
        >
          <ProviderIcon className="size-5" providerId={providerConfig.id} />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5 pr-16">
          <h3 className="font-medium text-sm">{providerConfig.title}</h3>
          <div className="flex flex-wrap gap-1">
            {providerConfig.models.map((m) => (
              <Badge
                className="border-0 bg-secondary/50 px-1.5 py-0 text-[10px] text-secondary-foreground/70"
                key={m}
                variant="secondary"
              >
                {m}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 border-t pt-4">
        {hasKey ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10">
                <Check className="size-3 text-emerald-600 dark:text-emerald-400" weight="bold" />
              </div>
              <span className="text-muted-foreground text-xs">Key configured</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={isPriority}
                  id={`toggle-${providerConfig.id}`}
                  onCheckedChange={(checked) => onToggle(providerConfig.id, checked)}
                />
                <label
                  className="cursor-pointer text-muted-foreground text-xs"
                  htmlFor={`toggle-${providerConfig.id}`}
                >
                  {isPriority ? "Priority" : "Fallback"}
                </label>
              </div>
              <Button
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(providerConfig.id)}
                size="icon"
                variant="ghost"
              >
                <Trash className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <ApiKeyInputForm
            docs={providerConfig.docs}
            isValidating={isValidating[providerConfig.id]}
            onInputChange={(value) => onInputChange(providerConfig.id, value)}
            onSave={() => onSave(providerConfig.id)}
            placeholder={providerConfig.placeholder}
            title={providerConfig.title}
            validationError={validationErrors[providerConfig.id]}
            value={inputValue}
          />
        )}
      </div>
    </div>
  );
}

export function ApiKeysSettingsPage() {
  const { apiKeys } = useUser();
  const saveApiKey = useMutation(api.api_keys.saveApiKey);
  const deleteApiKey = useMutation(api.api_keys.deleteApiKey);
  const updateMode = useMutation(api.api_keys.updateApiKeyMode);

  interface ApiKeysState {
    inputValues: Record<string, string>;
    validationErrors: Record<string, string>;
    isValidating: Record<string, boolean>;
    showDeleteDialog: boolean;
    providerToDelete: Provider | null;
    isDeleting: boolean;
  }
  type ApiKeysAction =
    | { type: "SET_INPUT"; provider: string; value: string }
    | { type: "SET_VALIDATION_ERROR"; provider: string; error: string }
    | { type: "SET_VALIDATING"; provider: string; value: boolean }
    | { type: "CLEAR_INPUTS" }
    | { type: "START_DELETE"; provider: Provider }
    | { type: "CANCEL_DELETE" }
    | { type: "SET_DELETING"; value: boolean }
    | { type: "DELETE_DONE" };

  const [apiKeysState, dispatch] = useReducer(
    (s: ApiKeysState, action: ApiKeysAction): ApiKeysState => {
      switch (action.type) {
        case "SET_INPUT":
          return { ...s, inputValues: { ...s.inputValues, [action.provider]: action.value } };
        case "SET_VALIDATION_ERROR":
          return {
            ...s,
            validationErrors: { ...s.validationErrors, [action.provider]: action.error },
          };
        case "SET_VALIDATING":
          return { ...s, isValidating: { ...s.isValidating, [action.provider]: action.value } };
        case "CLEAR_INPUTS":
          return { ...s, inputValues: {} };
        case "START_DELETE":
          return { ...s, providerToDelete: action.provider, showDeleteDialog: true };
        case "CANCEL_DELETE":
          return { ...s, showDeleteDialog: false, providerToDelete: null };
        case "SET_DELETING":
          return { ...s, isDeleting: action.value };
        case "DELETE_DONE":
          return { ...s, isDeleting: false, showDeleteDialog: false, providerToDelete: null };
      }
    },
    {
      inputValues: {},
      validationErrors: {},
      isValidating: {},
      showDeleteDialog: false,
      providerToDelete: null,
      isDeleting: false,
    },
  );
  const {
    inputValues,
    validationErrors,
    isValidating,
    showDeleteDialog,
    providerToDelete,
    isDeleting,
  } = apiKeysState;

  useEffect(
    () => () => {
      dispatch({ type: "CLEAR_INPUTS" });
    },
    [],
  );

  const handleSave = useCallback(
    async (provider: Provider) => {
      const key = inputValues[provider] || "";

      if (!key.trim()) {
        return;
      }

      const validation = validateApiKey(provider, key);
      if (!validation.isValid) {
        dispatch({
          type: "SET_VALIDATION_ERROR",
          provider,
          error: validation.error || "Invalid API key",
        });
        return;
      }

      dispatch({ type: "SET_VALIDATION_ERROR", provider, error: "" });
      dispatch({ type: "SET_VALIDATING", provider, value: true });

      await saveApiKey({ provider, key })
        .then(() => {
          toast({ title: "API key saved", status: "success" });
          dispatch({ type: "SET_INPUT", provider, value: "" });
        })
        .catch(() => {
          toast({ title: "Failed to save key", status: "error" });
        })
        .finally(() => {
          dispatch({ type: "SET_VALIDATING", provider, value: false });
        });
    },
    [saveApiKey, inputValues],
  );

  const handleInputChange = useCallback(
    (provider: Provider, value: string) => {
      dispatch({ type: "SET_INPUT", provider, value });
      if (validationErrors[provider]) {
        dispatch({ type: "SET_VALIDATION_ERROR", provider, error: "" });
      }
    },
    [validationErrors],
  );

  const handleDelete = useCallback((provider: Provider) => {
    dispatch({ type: "START_DELETE", provider });
  }, []);

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isDeleting) {
        return;
      }
      if (!open) {
        dispatch({ type: "CANCEL_DELETE" });
      }
    },
    [isDeleting],
  );

  const handleCancelDelete = useCallback(() => {
    dispatch({ type: "CANCEL_DELETE" });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!providerToDelete) {
      return;
    }
    dispatch({ type: "SET_DELETING", value: true });
    await deleteApiKey({ provider: providerToDelete })
      .then(() => {
        toast({ title: "API key deleted", status: "success" });
      })
      .catch(() => {
        toast({ title: "Failed to delete key", status: "error" });
      })
      .finally(() => {
        dispatch({ type: "DELETE_DONE" });
      });
  }, [deleteApiKey, providerToDelete]);

  const handleToggle = useCallback(
    async (provider: Provider, checked: boolean) => {
      await updateMode({ provider, mode: checked ? "priority" : "fallback" }).catch(() => {
        toast({ title: "Failed to update mode", status: "error" });
      });
    },
    [updateMode],
  );

  const configuredCount = apiKeys.length;
  const priorityCount = apiKeys.filter((k) => k.mode === "priority").length;

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-semibold text-2xl tracking-tight">API Keys</h1>
          {configuredCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs">
                {configuredCount} configured
              </span>
              {priorityCount > 0 && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 font-medium text-blue-600 text-xs dark:text-blue-400">
                    {priorityCount} priority
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Bring your own API keys for select models. Messages sent using your keys won&apos;t count
          towards your monthly limits.
        </p>
        <div className="flex gap-6 rounded-xl border bg-card/50 p-4">
          <div className="flex flex-1 items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <span className="font-semibold text-blue-600 text-xs dark:text-blue-400">1st</span>
            </div>
            <div className="space-y-0.5">
              <p className="font-medium text-foreground text-sm">Priority</p>
              <p className="text-muted-foreground text-xs">
                Your API key is used first for all requests
              </p>
            </div>
          </div>
          <div className="w-px bg-border" />
          <div className="flex flex-1 items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <span className="font-semibold text-muted-foreground text-xs">2nd</span>
            </div>
            <div className="space-y-0.5">
              <p className="font-medium text-foreground text-sm">Fallback</p>
              <p className="text-muted-foreground text-xs">
                Credits used first, your key when exhausted
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {PROVIDERS.map((providerConfig) => (
          <ProviderCard
            inputValue={inputValues[providerConfig.id] || ""}
            isValidating={isValidating}
            key={providerConfig.id}
            onDelete={handleDelete}
            onInputChange={handleInputChange}
            onSave={handleSave}
            onToggle={handleToggle}
            providerConfig={providerConfig}
            savedApiKeys={apiKeys}
            validationErrors={validationErrors}
          />
        ))}
      </div>

      <Dialog onOpenChange={handleDialogOpenChange} open={showDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API key?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the saved API key for{" "}
              {providerToDelete ? PROVIDERS.find((p) => p.id === providerToDelete)?.title : null}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleCancelDelete} variant="outline">
              Cancel
            </Button>
            <Button disabled={isDeleting} onClick={confirmDelete} variant="destructive">
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

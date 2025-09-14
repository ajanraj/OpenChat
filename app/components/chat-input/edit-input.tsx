"use client";

import { ArrowUpIcon } from "@phosphor-icons/react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { useEditClickOutside } from "@/app/hooks/use-edit-click-outside";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { Button } from "@/components/ui/button";
import { MODEL_DEFAULT, MODELS_MAP } from "@/lib/config";
import { ButtonFileUpload } from "./button-file-upload";
import { ButtonSearch } from "./button-search";
import { FileList } from "./file-list";
import { SelectModel } from "./select-model";
import { SelectReasoningEffort } from "./select-reasoning-effort";

type ReasoningEffort = "low" | "medium" | "high";

type EditInputProps = {
  initialValue: string;
  onSend: (
    message: string,
    options: {
      enableSearch: boolean;
      model: string;
      files: File[];
      reasoningEffort: ReasoningEffort;
      removedFileUrls?: string[];
    }
  ) => void;
  onCancel: () => void;
  // Initial values for edit mode
  initialFiles?: File[];
  existingFiles?: Array<{
    url: string;
    filename?: string;
    mediaType?: string;
  }>;
  selectedModel: string;
  isSearchEnabled?: boolean;
  isUserAuthenticated: boolean;
  status?: "submitted" | "streaming" | "ready" | "error";
  isReasoningModel?: boolean;
  reasoningEffort?: ReasoningEffort;
};

export function EditInput({
  initialValue,
  onSend,
  onCancel,
  initialFiles = [],
  existingFiles = [],
  selectedModel,
  isSearchEnabled = false,
  isUserAuthenticated,
  status,
  isReasoningModel = false,
  reasoningEffort = "medium",
}: EditInputProps) {
  // Local state for edit mode (isolated from global chat state)
  const [value, setValue] = useState(initialValue);
  const [editSearchEnabled, setEditSearchEnabled] = useState(isSearchEnabled);
  const [editModel, setEditModel] = useState(() => {
    // Validate if the selected model exists in available models
    if (selectedModel && MODELS_MAP[selectedModel]) {
      return selectedModel; // Use the message-specific model if it exists
    }
    // Fall back to default model if the inferred model doesn't exist
    return MODEL_DEFAULT;
  });
  const [editFiles, setEditFiles] = useState<File[]>(initialFiles);
  // Track which existing files are kept; default to all existing files
  const [keptExistingUrls, setKeptExistingUrls] = useState<Set<string>>(
    () => new Set(existingFiles.map((f) => f.url.split("?")[0]))
  );
  const [editReasoningEffort, setEditReasoningEffort] =
    useState<ReasoningEffort>(reasoningEffort);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editContainerRef = useRef<HTMLDivElement | null>(null);

  // Click outside to cancel (ignores portal elements like dropdowns)
  useEditClickOutside(editContainerRef, onCancel);

  // Check if there are any actual changes from the initial state
  const hasChanges = useCallback(() => {
    // Quick text comparison first (most common change)
    if (value.trim() !== initialValue.trim()) {
      return true;
    }

    // Model/settings changes
    if (editModel !== selectedModel) {
      return true;
    }
    if (editSearchEnabled !== isSearchEnabled) {
      return true;
    }
    if (editReasoningEffort !== reasoningEffort) {
      return true;
    }

    // File changes (more expensive, check last)
    if (editFiles.length !== initialFiles.length) {
      return true;
    }

    // Only do deep file comparison if lengths match but we need to check content
    if (
      existingFiles.length > 0 &&
      keptExistingUrls.size !== existingFiles.length
    ) {
      return true;
    }

    const existingCanonical = new Set(
      existingFiles.map((f) => f.url.split("?")[0])
    );
    if (
      existingFiles.length > 0 &&
      Array.from(keptExistingUrls).some((u) => !existingCanonical.has(u))
    ) {
      return true;
    }

    return editFiles.some(
      (file) =>
        !initialFiles.some(
          (initial) => initial.name === file.name && initial.size === file.size
        )
    );
  }, [
    value,
    initialValue,
    editModel,
    selectedModel,
    editSearchEnabled,
    isSearchEnabled,
    editReasoningEffort,
    reasoningEffort,
    editFiles,
    initialFiles,
    existingFiles,
    keptExistingUrls,
  ]);

  const handleSend = useCallback(() => {
    if (!value.trim() && editFiles.length === 0) {
      return;
    }
    if (!hasChanges()) {
      return;
    }
    const removedFileUrls = existingFiles
      .map((f) => f.url.split("?")[0])
      .filter((u) => !keptExistingUrls.has(u));
    onSend(value, {
      enableSearch: editSearchEnabled,
      model: editModel,
      files: editFiles,
      reasoningEffort: editReasoningEffort,
      removedFileUrls,
    });
  }, [
    value,
    editFiles,
    onSend,
    editSearchEnabled,
    editModel,
    editReasoningEffort,
    hasChanges,
    existingFiles,
    keptExistingUrls,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [handleSend, onCancel]
  );

  return (
    <div className="w-full" ref={editContainerRef}>
      <PromptInput
        className="relative z-10 p-0 pb-2 backdrop-blur-xl"
        maxHeight={200}
        onValueChange={setValue}
        value={value}
      >
        <FileList
          existingAttachments={existingFiles}
          files={editFiles}
          keptUrls={keptExistingUrls}
          onFileRemoveAction={(file) =>
            setEditFiles((prev) => prev.filter((f) => f !== file))
          }
          onToggleExisting={(url) =>
            setKeptExistingUrls((prev) => {
              const next = new Set(prev);
              const canonical = url.split("?")[0];
              if (next.has(canonical)) {
                next.delete(canonical);
              } else {
                next.add(canonical);
              }
              return next;
            })
          }
        />
        <PromptInputTextarea
          className="mt-2 ml-2 text-foreground leading-[1.3]"
          disabled={status === "streaming"}
          onKeyDown={handleKeyDown}
          placeholder="Edit message..."
          ref={textareaRef}
        />
        <PromptInputActions className="mt-5 w-full justify-between px-2 sm:px-2">
          <div className="flex origin-left scale-90 transform gap-1 sm:scale-100 sm:gap-2">
            <ButtonFileUpload
              isUserAuthenticated={isUserAuthenticated}
              model={editModel}
              onFileUpload={(files) =>
                setEditFiles((prev) => [...prev, ...files])
              }
            />
            <ButtonSearch
              isUserAuthenticated={isUserAuthenticated}
              model={editModel}
              onSearch={() => setEditSearchEnabled(!editSearchEnabled)}
              searchEnabled={editSearchEnabled}
            />
            <SelectModel
              isUserAuthenticated={isUserAuthenticated}
              onSelectModel={setEditModel}
              selectedModel={editModel}
            />
            {isReasoningModel && (
              <SelectReasoningEffort
                isUserAuthenticated={isUserAuthenticated}
                onSelectReasoningEffortAction={setEditReasoningEffort}
                reasoningEffort={editReasoningEffort}
              />
            )}
          </div>
          <PromptInputAction tooltip="Save edit">
            <Button
              aria-label="Save edit"
              className="origin-right scale-90 transform rounded-full transition-all duration-300 ease-out sm:scale-100"
              disabled={
                (!value.trim() && editFiles.length === 0) || !hasChanges()
              }
              onClick={handleSend}
              size="sm"
              type="button"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
    </div>
  );
}

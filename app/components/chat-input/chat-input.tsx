'use client';

import { ArrowUp, Globe, Stop, X } from '@phosphor-icons/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/prompt-kit/prompt-input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import {
  getAllowedLabel,
  PASTE_ALLOWED_MIME,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_LABEL,
} from '@/lib/config/upload';
import { ButtonFileUpload } from './button-file-upload';
import { ButtonToolsDropdown } from './button-tools-dropdown';
import { FileList } from './file-list';
import { PromptSystem } from './prompt-system';
import { SelectModel } from './select-model';
import { SelectReasoningEffort } from './select-reasoning-effort';

type ReasoningEffort = 'low' | 'medium' | 'high';

type ChatInputProps = {
  onSendAction: (message: string, options: { enableSearch: boolean }) => void;
  isSubmitting?: boolean;
  hasMessages?: boolean;
  files: File[];
  onFileUploadAction: (files: File[]) => void;
  onFileRemoveAction: (file: File) => void;
  onSuggestionAction: (suggestion: string) => void;
  hasSuggestions?: boolean;
  onSelectModelAction: (model: string) => void;
  selectedModel: string;
  isUserAuthenticated: boolean;
  onSelectSystemPromptAction: (personaId: string) => void;
  selectedPersonaId?: string;
  stopAction: () => void;
  status?: 'submitted' | 'streaming' | 'ready' | 'error';
  isReasoningModel: boolean;
  reasoningEffort: ReasoningEffort;
  onSelectReasoningEffortAction: (reasoningEffort: ReasoningEffort) => void;
  initialValue?: string;
};

export function ChatInput({
  onSendAction,
  isSubmitting,
  files,
  onFileUploadAction,
  onFileRemoveAction,
  onSuggestionAction,
  hasSuggestions,
  onSelectModelAction,
  selectedModel,
  isUserAuthenticated,
  onSelectSystemPromptAction,
  selectedPersonaId,
  stopAction,
  status,
  isReasoningModel,
  reasoningEffort,
  onSelectReasoningEffortAction,
  initialValue = '',
}: ChatInputProps) {
  // Local state for input value to prevent parent re-renders
  const [value, setValue] = useState(initialValue);
  const [searchEnabled, setSearchEnabled] = React.useState(false);
  const toggleSearch = useCallback(() => {
    setSearchEnabled((prev) => !prev);
  }, []);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Track isEmpty state to prevent PromptSystem re-renders on every keystroke
  const [isEmpty, setIsEmpty] = useState(true);

  // Only update isEmpty when the emptiness state actually changes
  useEffect(() => {
    const currentEmpty = !value || value.trim() === '';
    if (currentEmpty !== isEmpty) {
      setIsEmpty(currentEmpty);
    }
  }, [value, isEmpty]);

  // Update local value when initialValue changes (e.g., when using suggestions)
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isSubmitting) {
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSendAction(value, { enableSearch: searchEnabled });
        setValue(''); // Clear input after sending
      }
    },
    [onSendAction, isSubmitting, searchEnabled, value]
  );

  const handleMainClick = () => {
    if (status === 'streaming') {
      stopAction();
      return;
    }

    if (isSubmitting || !value.trim()) {
      // Prevent double submission or empty submission
      return;
    }

    onSendAction(value, { enableSearch: searchEnabled });
    setValue(''); // Clear input after sending
  };

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setValue(suggestion);
      onSuggestionAction(suggestion);
    },
    [onSuggestionAction]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) {
        return;
      }

      // Check if there are any file items in the clipboard (not just text)
      const hasFiles = Array.from(items).some((item) => item.kind === 'file');
      // If user is not authenticated and trying to paste files, prevent it
      if (!isUserAuthenticated && hasFiles) {
        e.preventDefault();
        return;
      }

      // If no files or user is authenticated, allow default text paste behavior
      if (!hasFiles) {
        return;
      }

      // Handle image pasting for authenticated users
      const imageFiles: File[] = [];
      const allowed = new Set<string>(PASTE_ALLOWED_MIME as readonly string[]);
      let hadInvalidType = false;
      let hadTooLarge: { size: number } | null = null;

      for (const item of Array.from(items)) {
        if (item.type && allowed.has(item.type)) {
          const file = item.getAsFile();
          if (file) {
            if (file.size > UPLOAD_MAX_BYTES) {
              hadTooLarge = { size: file.size };
              continue;
            }
            const newFile = new File(
              [file],
              `pasted-image-${Date.now()}.${file.type.split('/')[1]}`,
              { type: file.type }
            );
            imageFiles.push(newFile);
          }
        } else if (item.type.startsWith('image/')) {
          hadInvalidType = true;
        }
      }

      if (imageFiles.length > 0) {
        onFileUploadAction(imageFiles);
      } else {
        // If there were image items but none matched allowed types, show feedback
        const hadAnyImages = Array.from(items).some((it) =>
          it.type.startsWith('image/')
        );
        if (hadAnyImages) {
          e.preventDefault();
          if (hadTooLarge) {
            toast({
              title: 'File too large',
              description: `Max ${UPLOAD_MAX_LABEL} per file`,
              status: 'error',
            });
          } else if (hadInvalidType) {
            toast({
              title: 'File not supported',
              description: `Allowed: ${getAllowedLabel(Array.from(allowed))}`,
              status: 'error',
            });
          }
        }
      }
    },
    [isUserAuthenticated, onFileUploadAction]
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.addEventListener('paste', handlePaste);
    return () => el.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // Auto-focus on typing: focus the textarea when user starts typing
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if input is already focused or disabled
      if (isSubmitting || !textareaRef.current) {
        return;
      }

      // Don't steal focus if another input element is already focused
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Don't focus on modifier keys, function keys, or special keys
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Only focus on printable characters (exclude special keys)
      const isPrintableChar =
        e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

      if (isPrintableChar && textareaRef.current) {
        // Focus the textarea and let the character be typed normally
        textareaRef.current.focus();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isSubmitting]);

  // Compute tooltip text without nested ternary expressions
  let tooltipText = 'Send';
  if (status === 'streaming') {
    tooltipText = 'Stop';
  } else if (isSubmitting && files.length > 0) {
    tooltipText = 'Uploading...';
  }

  return (
    <div className="relative flex w-full flex-col gap-4">
      {hasSuggestions && (
        <PromptSystem
          isEmpty={isEmpty}
          onSelectSystemPrompt={onSelectSystemPromptAction}
          onSuggestion={handleSuggestionClick}
          onValueChange={setValue}
          selectedPersonaId={selectedPersonaId}
        />
      )}
      <div className="relative order-2 px-2 pb-3 sm:pb-4 md:order-1">
        <PromptInput
          className="relative z-10 p-0 pb-2 backdrop-blur-xl"
          maxHeight={200}
          onValueChange={setValue}
          value={value}
        >
          <FileList files={files} onFileRemoveAction={onFileRemoveAction} />
          <PromptInputTextarea
            className="mt-2 ml-2 text-foreground leading-[1.3]"
            disabled={isSubmitting}
            onKeyDown={handleKeyDown}
            placeholder="How can I help you today?"
            ref={textareaRef}
          />
          <PromptInputActions className="mt-5 w-full justify-between px-2 sm:px-2">
            <div className="flex origin-left scale-90 transform gap-1 sm:scale-100 sm:gap-2">
              <ButtonFileUpload
                isUserAuthenticated={isUserAuthenticated}
                model={selectedModel}
                onFileUpload={onFileUploadAction}
              />
              <ButtonToolsDropdown
                isUserAuthenticated={isUserAuthenticated}
                onToggleSearch={toggleSearch}
                searchEnabled={searchEnabled}
                selectedModel={selectedModel}
              />
              {searchEnabled && (
                <Button
                  aria-label="Disable search"
                  className="group hidden size-9 rounded-full border border-blue-200 bg-blue-50 p-0 sm:flex dark:border-blue-800 dark:bg-blue-950/30"
                  onClick={toggleSearch}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Globe className="size-4 text-blue-700 transition-opacity group-hover:opacity-0 dark:text-blue-400" />
                  <X className="absolute size-4 text-blue-700 opacity-0 transition-opacity group-hover:opacity-100 dark:text-blue-400" />
                </Button>
              )}
              <SelectModel
                isUserAuthenticated={isUserAuthenticated}
                onSelectModel={onSelectModelAction}
                selectedModel={selectedModel}
              />
              {isReasoningModel && (
                <SelectReasoningEffort
                  isUserAuthenticated={isUserAuthenticated}
                  onSelectReasoningEffortAction={onSelectReasoningEffortAction}
                  reasoningEffort={reasoningEffort}
                />
              )}
            </div>
            <PromptInputAction tooltip={tooltipText}>
              <Button
                aria-label="Send message"
                className="origin-right scale-90 transform rounded-full transition-all duration-300 ease-out sm:scale-100"
                disabled={
                  !value.trim() &&
                  files.length === 0 &&
                  status !== 'streaming' &&
                  status !== 'submitted'
                }
                onClick={handleMainClick}
                size="sm"
                type="button"
              >
                {status === 'streaming' || status === 'submitted' ? (
                  <Stop className="size-4" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  );
}

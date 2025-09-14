"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { TRANSITION_SUGGESTIONS } from "@/lib/motion";
import { SUGGESTIONS as SUGGESTIONS_CONFIG } from "../../../lib/config";

type SuggestionsProps = {
  onValueChange: (value: string) => void;
  onSuggestion: (suggestion: string) => void;
  isEmpty?: boolean;
};

// Create a stable motion-wrapped component once to avoid recreating
// a new component type on every render, which caused unnecessary
// unmounts/remounts of all suggestions.
const MotionPromptSuggestion = motion.create(PromptSuggestion);

export const Suggestions = memo(function SuggestionsComponent({
  onValueChange,
  // onSuggestion,
  isEmpty = true,
}: SuggestionsProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const activeCategoryData = SUGGESTIONS_CONFIG.find(
    (group) => group.label === activeCategory
  );

  const showCategorySuggestions =
    activeCategoryData && activeCategoryData.items.length > 0;

  useEffect(() => {
    if (isEmpty) {
      setActiveCategory(null);
    }
  }, [isEmpty]);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      setActiveCategory(null);
      // Instead of immediately adding the suggestion as a message (which
      // caused an empty `input` value and prevented the chat from being
      // created), we now simply populate the input field with the selected
      // suggestion. The user can then hit Enter / click Send to submit the
      // message, ensuring that `ensureChatExists` has the correct `input`
      // value and creates the chat before the first API request.
      onValueChange(suggestion);
    },
    [onValueChange]
  );

  const handleCategoryClick = useCallback(
    (suggestion: { label: string; prompt: string }) => {
      setActiveCategory(suggestion.label);
      onValueChange(suggestion.prompt);
    },
    [onValueChange]
  );

  const suggestionsGrid = useMemo(
    () => (
      <motion.div
        animate="animate"
        className="flex w-full max-w-full flex-nowrap justify-start gap-2 overflow-x-auto px-2 md:mx-auto md:max-w-2xl md:flex-wrap md:justify-center md:pl-0"
        exit="exit"
        initial="initial"
        key="suggestions-grid"
        style={{
          scrollbarWidth: "none",
        }}
        transition={TRANSITION_SUGGESTIONS}
        variants={{
          initial: { opacity: 0, y: 10, filter: "blur(4px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          exit: { opacity: 0, y: -10, filter: "blur(4px)" },
        }}
      >
        {SUGGESTIONS_CONFIG.map((suggestion, index) => (
          <MotionPromptSuggestion
            animate="animate"
            className="capitalize"
            exit="exit"
            initial="initial"
            key={suggestion.label}
            onClick={() => handleCategoryClick(suggestion)}
            transition={{
              ...TRANSITION_SUGGESTIONS,
              delay: index * 0.02,
            }}
            variants={{
              initial: { opacity: 0, scale: 0.8 },
              animate: { opacity: 1, scale: 1 },
              exit: { opacity: 0, scale: 0.8 },
            }}
          >
            <suggestion.icon className="size-4" />
            {suggestion.label}
          </MotionPromptSuggestion>
        ))}
      </motion.div>
    ),
    [handleCategoryClick]
  );

  const suggestionsList = useMemo(
    () => (
      <motion.div
        animate="animate"
        className="flex w-full flex-col space-y-1 px-2"
        exit="exit"
        initial="initial"
        key={activeCategoryData?.label}
        transition={TRANSITION_SUGGESTIONS}
        variants={{
          initial: { opacity: 0, y: 10, filter: "blur(4px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          exit: { opacity: 0, y: -10, filter: "blur(4px)" },
        }}
      >
        {activeCategoryData?.items.map((suggestion: string, index: number) => (
          <MotionPromptSuggestion
            animate="animate"
            className="text-left"
            exit="exit"
            highlight={activeCategoryData.highlight}
            initial="initial"
            key={`${activeCategoryData?.label}-${suggestion}-${index}`}
            onClick={() => handleSuggestionClick(suggestion)}
            transition={{
              ...TRANSITION_SUGGESTIONS,
              delay: index * 0.05,
            }}
            type="button"
            variants={{
              initial: { opacity: 0, y: -10 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: 10 },
            }}
          >
            {suggestion}
          </MotionPromptSuggestion>
        ))}
      </motion.div>
    ),
    [
      handleSuggestionClick,
      activeCategoryData?.highlight,
      activeCategoryData?.items,
      activeCategoryData?.label,
    ]
  );

  return (
    <AnimatePresence mode="popLayout">
      {showCategorySuggestions ? suggestionsList : suggestionsGrid}
    </AnimatePresence>
  );
});

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";
import { SUGGESTIONS as SUGGESTIONS_CONFIG } from "@/lib/config";
import { TRANSITION_SUGGESTIONS } from "@/lib/motion";

type SuggestionsProps = {
	onValueChange: (value: string) => void;
	onSuggestion: (suggestion: string) => void;
	isEmpty?: boolean;
};

// Create a stable motion-wrapped component once to avoid recreating
// a new component type on every render, which caused unnecessary
// unmounts/remounts of all suggestions.
const MotionPromptSuggestion = m.create(PromptSuggestion);

export const Suggestions = memo(function SuggestionsComponent({
	onValueChange,
	// onSuggestion,
	isEmpty = true,
}: SuggestionsProps) {
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const shouldReduceMotion = useReducedMotion();
	const activeCategory = isEmpty ? null : selectedCategory;

	const activeCategoryData = SUGGESTIONS_CONFIG.find(
		(group) => group.label === activeCategory,
	);

	const showCategorySuggestions =
		activeCategoryData && activeCategoryData.items.length > 0;

	const handleSuggestionClick = useCallback(
		(suggestion: string) => {
			setSelectedCategory(null);
			// Instead of immediately adding the suggestion as a message (which
			// caused an empty `input` value and prevented the chat from being
			// created), we now simply populate the input field with the selected
			// suggestion. The user can then hit Enter / click Send to submit the
			// message, ensuring that `ensureChatExists` has the correct `input`
			// value and creates the chat before the first API request.
			onValueChange(suggestion);
		},
		[onValueChange],
	);

	const handleCategoryClick = useCallback(
		(suggestion: { label: string; prompt: string }) => {
			setSelectedCategory(suggestion.label);
			onValueChange(suggestion.prompt);
		},
		[onValueChange],
	);

	const suggestionsGrid = useMemo(
		() => (
			<m.div
				animate="animate"
				className="flex w-full max-w-full flex-nowrap justify-start gap-2 overflow-x-auto px-2 md:mx-auto md:max-w-2xl md:flex-wrap md:justify-center md:pl-0"
				exit="exit"
				initial="initial"
				key="suggestions-grid"
				style={{
					scrollbarWidth: "none",
				}}
				transition={shouldReduceMotion ? { duration: 0 } : TRANSITION_SUGGESTIONS}
				variants={
					shouldReduceMotion
						? {
								initial: { opacity: 0 },
								animate: { opacity: 1 },
								exit: { opacity: 0 },
							}
						: {
								initial: { opacity: 0, y: 10, filter: "blur(4px)" },
								animate: { opacity: 1, y: 0, filter: "blur(0px)" },
								exit: { opacity: 0, y: -10, filter: "blur(4px)" },
							}
				}
			>
				{SUGGESTIONS_CONFIG.map((suggestion, index) => (
					<MotionPromptSuggestion
						animate="animate"
						className="capitalize"
						exit="exit"
						initial="initial"
						key={suggestion.label}
						onClick={() => handleCategoryClick(suggestion)}
						transition={
							shouldReduceMotion
								? { duration: 0 }
								: {
										...TRANSITION_SUGGESTIONS,
										delay: index * 0.02,
									}
						}
						variants={
							shouldReduceMotion
								? {
										initial: { opacity: 0 },
										animate: { opacity: 1 },
										exit: { opacity: 0 },
									}
								: {
										initial: { opacity: 0, scale: 0.8 },
										animate: { opacity: 1, scale: 1 },
										exit: { opacity: 0, scale: 0.8 },
									}
						}
					>
						<suggestion.icon className="size-4" />
						{suggestion.label}
					</MotionPromptSuggestion>
				))}
			</m.div>
		),
		[handleCategoryClick, shouldReduceMotion],
	);

	const suggestionsList = useMemo(
		() => (
			<m.div
				animate="animate"
				className="flex w-full flex-col space-y-1 px-2"
				exit="exit"
				initial="initial"
				key={activeCategoryData?.label}
				transition={shouldReduceMotion ? { duration: 0 } : TRANSITION_SUGGESTIONS}
				variants={
					shouldReduceMotion
						? {
								initial: { opacity: 0 },
								animate: { opacity: 1 },
								exit: { opacity: 0 },
							}
						: {
								initial: { opacity: 0, y: 10, filter: "blur(4px)" },
								animate: { opacity: 1, y: 0, filter: "blur(0px)" },
								exit: { opacity: 0, y: -10, filter: "blur(4px)" },
							}
				}
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
						transition={
							shouldReduceMotion
								? { duration: 0 }
								: {
										...TRANSITION_SUGGESTIONS,
										delay: index * 0.05,
									}
						}
						type="button"
						variants={
							shouldReduceMotion
								? {
										initial: { opacity: 0 },
										animate: { opacity: 1 },
										exit: { opacity: 0 },
									}
								: {
										initial: { opacity: 0, y: -10 },
										animate: { opacity: 1, y: 0 },
										exit: { opacity: 0, y: 10 },
									}
						}
					>
						{suggestion}
					</MotionPromptSuggestion>
				))}
			</m.div>
		),
		[handleSuggestionClick, activeCategoryData, shouldReduceMotion],
	);

	return (
		<AnimatePresence mode="popLayout">
			{showCategorySuggestions ? (
				<div>{suggestionsList}</div>
			) : (
				<div>{suggestionsGrid}</div>
			)}
		</AnimatePresence>
	);
});

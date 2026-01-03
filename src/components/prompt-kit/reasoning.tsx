import { CaretDown } from "@phosphor-icons/react";
import { motion, type Transition } from "motion/react";
import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";

const springTransition: Transition = {
	type: "spring",
	stiffness: 400,
	damping: 30,
	mass: 0.8,
};

const ReasoningContext = createContext<{
	isExpanded: boolean;
	toggle: () => void;
	isLoading?: boolean;
} | null>(null);

function useReasoningContext() {
	const ctx = useContext(ReasoningContext);
	if (!ctx) {
		throw new Error("Reasoning.* must be used inside <Reasoning>");
	}
	return ctx;
}

export type ReasoningProps = {
	children: React.ReactNode;
	defaultExpanded?: boolean;
	expanded?: boolean;
	onToggle?: () => void;
	isLoading?: boolean;
	className?: string;
};

export function Reasoning({
	children,
	defaultExpanded = false,
	expanded,
	onToggle,
	isLoading = false,
	className,
}: ReasoningProps) {
	const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

	// Use controlled state if provided, otherwise use internal state
	const isExpanded = expanded !== undefined ? expanded : internalExpanded;

	const toggle = () => {
		if (onToggle) {
			onToggle();
		} else {
			setInternalExpanded((prev) => !prev);
		}
	};

	return (
		<ReasoningContext.Provider value={{ isExpanded, toggle, isLoading }}>
			<div
				className={cn(
					"relative w-full max-w-full rounded-xl border px-4 shadow-xs",
					className,
				)}
			>
				{children}
			</div>
		</ReasoningContext.Provider>
	);
}

export type ReasoningTriggerProps = {
	className?: string;
};

export function ReasoningTrigger({ className }: ReasoningTriggerProps) {
	const { isExpanded, toggle, isLoading } = useReasoningContext();

	return (
		<div>
			<button
				className={cn(
					"flex h-10 w-full cursor-pointer items-center",
					className,
				)}
				disabled={isLoading}
				onClick={toggle}
				type="button"
			>
				<span className="relative mr-2.75 flex size-2.25">
					{isLoading && (
						<motion.span
							animate={{
								scale: [1, 1.8, 1],
								opacity: [0.7, 0.3, 0.7],
							}}
							className={cn(
								"absolute inline-flex h-full w-full rounded-full",
								"bg-orange-400 dark:bg-orange-300",
							)}
							transition={{
								duration: 1.5,
								repeat: Infinity,
								ease: "easeInOut",
							}}
						/>
					)}
					<span
						className={cn(
							"relative inline-flex size-2.25 rounded-full transition-colors duration-300",
							isLoading
								? "bg-orange-500 dark:bg-orange-400"
								: "bg-blue-600 dark:bg-blue-400",
						)}
					/>
				</span>
				<span className="font-medium text-sm">
					{isLoading ? "Reasoning" : "Reasoned for a few seconds"}
				</span>
				<div className="flex-grow" />
				<div
					className={cn(
						"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm shadow-none outline-none transition-all",
						"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
						"disabled:pointer-events-none disabled:opacity-50",
						"aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
						"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
						"text-muted-foreground shadow-none hover:bg-muted hover:text-muted-foreground",
						"absolute top-1.5 right-1.5 h-7 w-7",
					)}
				>
					<motion.div
						animate={{ rotate: isExpanded ? 180 : 0 }}
						transition={springTransition}
					>
						<CaretDown className="size-4" />
					</motion.div>
				</div>
			</button>
		</div>
	);
}

export type ReasoningContentProps = {
	children: React.ReactNode;
	className?: string;
};

export function ReasoningContent({
	children,
	className,
}: ReasoningContentProps) {
	const { isExpanded } = useReasoningContext();

	return (
		<div
			className={cn(
				"grid transition-[grid-template-rows,opacity] duration-300 ease-out",
				isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
			)}
		>
			<div className="overflow-hidden">
				<div
					className={cn(
						"prose-sm flex w-full flex-col justify-center gap-1 pt-2 pb-3.5",
						"[&_*]:!text-foreground/80 [&_*]:!text-sm whitespace-pre-line",
						"[&>:first-child:not(span)]:mt-2 [&>:last-child:not(span)]:mb-2",
						"[&>:only-child:not(span)]:mt-2 [&_p:has(>strong)+p]:mt-0",
						"[&_p:has(>strong)]:mb-0",
						className,
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}

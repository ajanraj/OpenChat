import {
	AnimatePresence,
	MotionConfig,
	m,
	type Transition,
	type Variants,
} from "motion/react";
import {
	createContext,
	isValidElement,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import useClickOutside from "@/hooks/use-click-outside";
import { cn } from "@/lib/utils";

const TRANSITION: Transition = {
	type: "spring",
	bounce: 0.1,
	duration: 0.4,
};

type MorphingPopoverContextValue = {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	uniqueId: string;
	variants?: Variants;
};

const MorphingPopoverContext =
	createContext<MorphingPopoverContextValue | null>(null);

function usePopoverLogic({
	defaultOpen = false,
	open: controlledOpen,
	onOpenChange,
}: {
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
} = {}) {
	const uniqueId = useId();
	const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);

	const isOpen = controlledOpen ?? uncontrolledOpen;

	const open = () => {
		if (controlledOpen === undefined) {
			setUncontrolledOpen(true);
		}
		onOpenChange?.(true);
	};

	const close = () => {
		if (controlledOpen === undefined) {
			setUncontrolledOpen(false);
		}
		onOpenChange?.(false);
	};

	return { isOpen, open, close, uniqueId };
}

export type MorphingPopoverProps = {
	children: React.ReactNode;
	transition?: Transition;
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	variants?: Variants;
	className?: string;
} & React.ComponentProps<"div">;

function MorphingPopover({
	children,
	transition = TRANSITION,
	defaultOpen,
	open,
	onOpenChange,
	variants,
	className,
	...props
}: MorphingPopoverProps) {
	const popoverLogic = usePopoverLogic({ defaultOpen, open, onOpenChange });

	return (
		<MorphingPopoverContext.Provider value={{ ...popoverLogic, variants }}>
			<MotionConfig transition={transition}>
				<div
					className={cn("relative flex items-center justify-center", className)}
					key={popoverLogic.uniqueId}
					{...props}
				>
					{children}
				</div>
			</MotionConfig>
		</MorphingPopoverContext.Provider>
	);
}

export type MorphingPopoverTriggerProps = {
	asChild?: boolean;
	children: React.ReactNode;
	className?: string;
} & React.ComponentProps<typeof m.button>;

function MorphingPopoverTrigger({
	children,
	className,
	asChild = false,
	...props
}: MorphingPopoverTriggerProps) {
	const context = useContext(MorphingPopoverContext);
	if (!context) {
		throw new Error(
			"MorphingPopoverTrigger must be used within MorphingPopover",
		);
	}

	if (asChild && isValidElement(children)) {
		return (
			<m.div
				aria-controls={`popover-content-${context.uniqueId}`}
				aria-expanded={context.isOpen}
				className={className}
				key={context.uniqueId}
				layoutId={`popover-trigger-${context.uniqueId}`}
				onClick={context.open}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						context.open();
					}
				}}
				role="button"
				tabIndex={0}
			>
				{children}
			</m.div>
		);
	}

	return (
		<m.div
			key={context.uniqueId}
			layoutId={`popover-trigger-${context.uniqueId}`}
			onClick={context.open}
		>
			<m.button
				{...props}
				layoutId={`popover-label-${context.uniqueId}`}
				key={context.uniqueId}
				className={className}
				aria-expanded={context.isOpen}
				aria-controls={`popover-content-${context.uniqueId}`}
			>
				{children}
			</m.button>
		</m.div>
	);
}

export type MorphingPopoverContentProps = {
	children: React.ReactNode;
	className?: string;
} & React.ComponentProps<typeof m.div>;

function MorphingPopoverContent({
	children,
	className,
	...props
}: MorphingPopoverContentProps) {
	const context = useContext(MorphingPopoverContext);
	if (!context)
		throw new Error(
			"MorphingPopoverContent must be used within MorphingPopover",
		);

	const ref = useRef<HTMLDivElement>(null);
	useClickOutside(ref, context.close);

	useEffect(() => {
		if (!context.isOpen) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") context.close();
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [context]);

	return (
		<AnimatePresence>
			{context.isOpen && (
				<>
					<m.div
						{...props}
						ref={ref}
						layoutId={`popover-trigger-${context.uniqueId}`}
						key={context.uniqueId}
						id={`popover-content-${context.uniqueId}`}
						role="dialog"
						aria-modal="true"
						className={cn(
							"bg-popover text-popover-foreground border-input absolute overflow-hidden rounded-md p-2 shadow-md backdrop-blur-xl",
							className,
						)}
						initial="initial"
						animate="animate"
						exit="exit"
						variants={context.variants}
					>
						{children}
					</m.div>
				</>
			)}
		</AnimatePresence>
	);
}

export { MorphingPopover, MorphingPopoverTrigger, MorphingPopoverContent };

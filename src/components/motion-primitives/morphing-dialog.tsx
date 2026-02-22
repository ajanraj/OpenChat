import { X } from "@phosphor-icons/react";
import {
	AnimatePresence,
	MotionConfig,
	m,
	type Transition,
	type Variant,
} from "motion/react";
import React, {
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import useClickOutside from "./useClickOutside";

export type MorphingDialogContextType = {
	isOpen: boolean;
	setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
	uniqueId: string;
	triggerRef: React.RefObject<HTMLDivElement | null>;
};

const MorphingDialogContext =
	React.createContext<MorphingDialogContextType | null>(null);

function useIsHydrated(): boolean {
	return useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);
}

function useMorphingDialog() {
	const context = useContext(MorphingDialogContext);
	if (!context) {
		throw new Error(
			"useMorphingDialog must be used within a MorphingDialogProvider",
		);
	}
	return context;
}

export type MorphingDialogProviderProps = {
	children: React.ReactNode;
	transition?: Transition;
};

function MorphingDialogProvider({
	children,
	transition,
}: MorphingDialogProviderProps) {
	const [isOpen, setIsOpen] = useState(false);
	const uniqueId = useId();
	const triggerRef = useRef<HTMLDivElement>(null);

	const contextValue = useMemo(
		() => ({
			isOpen,
			setIsOpen,
			uniqueId,
			triggerRef,
		}),
		[isOpen, uniqueId],
	);

	return (
		<MorphingDialogContext.Provider value={contextValue}>
			<MotionConfig transition={transition}>{children}</MotionConfig>
		</MorphingDialogContext.Provider>
	);
}

export type MorphingDialogProps = {
	children: React.ReactNode;
	transition?: Transition;
};

function MorphingDialog({ children, transition }: MorphingDialogProps) {
	return (
		<MorphingDialogProvider>
			<MotionConfig transition={transition}>{children}</MotionConfig>
		</MorphingDialogProvider>
	);
}

export type MorphingDialogTriggerProps = {
	children: React.ReactNode;
	className?: string;
	style?: React.CSSProperties;
	triggerRef?: React.RefObject<HTMLButtonElement>;
};

function MorphingDialogTrigger({
	children,
	className,
	style,
	triggerRef,
}: MorphingDialogTriggerProps) {
	const { setIsOpen, isOpen, uniqueId } = useMorphingDialog();

	const handleClick = useCallback(() => {
		setIsOpen((prev) => !prev);
	}, [setIsOpen]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				setIsOpen((prev) => !prev);
			}
		},
		[setIsOpen],
	);

	return (
		<m.button
			ref={triggerRef}
			layoutId={`dialog-${uniqueId}`}
			className={cn("relative", className)}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			style={style}
			aria-haspopup="dialog"
			aria-expanded={isOpen}
			aria-controls={`motion-ui-morphing-dialog-content-${uniqueId}`}
			aria-label={`Open dialog ${uniqueId}`}
		>
			{children}
		</m.button>
	);
}

export type MorphingDialogContentProps = {
	children: React.ReactNode;
	className?: string;
	style?: React.CSSProperties;
};

function MorphingDialogContent({
	children,
	className,
	style,
}: MorphingDialogContentProps) {
	const { setIsOpen, isOpen, uniqueId, triggerRef } = useMorphingDialog();
	const containerRef = useRef<HTMLDivElement>(null);
	const firstFocusableElementRef = useRef<HTMLElement | null>(null);
	const lastFocusableElementRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const firstFocusableElement = firstFocusableElementRef.current;
			const lastFocusableElement = lastFocusableElementRef.current;

			if (event.key === "Escape") {
				setIsOpen(false);
			}
			if (event.key === "Tab") {
				if (!firstFocusableElement || !lastFocusableElement) return;

				if (event.shiftKey) {
					if (document.activeElement === firstFocusableElement) {
						event.preventDefault();
						lastFocusableElement.focus();
					}
				} else {
					if (document.activeElement === lastFocusableElement) {
						event.preventDefault();
						firstFocusableElement.focus();
					}
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [setIsOpen]);

	useEffect(() => {
		if (isOpen) {
			document.body.classList.add("overflow-hidden");
			const focusableElements = containerRef.current?.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
			);
			if (focusableElements && focusableElements.length > 0) {
				const firstFocusableElement = focusableElements.item(0);
				const lastFocusableElement = focusableElements.item(
					focusableElements.length - 1,
				);
				if (
					firstFocusableElement instanceof HTMLElement &&
					lastFocusableElement instanceof HTMLElement
				) {
					firstFocusableElementRef.current = firstFocusableElement;
					lastFocusableElementRef.current = lastFocusableElement;
					firstFocusableElement.focus();
				}
			}
		} else {
			document.body.classList.remove("overflow-hidden");
			firstFocusableElementRef.current = null;
			lastFocusableElementRef.current = null;
			triggerRef.current?.focus();
		}
	}, [isOpen, triggerRef]);

	useClickOutside(containerRef, () => {
		if (isOpen) {
			setIsOpen(false);
		}
	});

	return (
		<m.div
			ref={containerRef}
			layoutId={`dialog-${uniqueId}`}
			className={cn("overflow-hidden", className)}
			style={style}
			role="dialog"
			aria-modal="true"
			aria-labelledby={`motion-ui-morphing-dialog-title-${uniqueId}`}
			aria-describedby={`motion-ui-morphing-dialog-description-${uniqueId}`}
		>
			{children}
		</m.div>
	);
}

export type MorphingDialogContainerProps = {
	children: React.ReactNode;
	className?: string;
	style?: React.CSSProperties;
};

function MorphingDialogContainer({ children }: MorphingDialogContainerProps) {
	const { isOpen, uniqueId } = useMorphingDialog();
	const mounted = useIsHydrated();

	if (!mounted) return null;

	return createPortal(
		<AnimatePresence initial={false} mode="sync">
			{isOpen && (
				<>
					<m.div
						key={`backdrop-${uniqueId}`}
						className="fixed inset-0 z-51 h-full w-full bg-white/40 backdrop-blur-xs"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
					/>
					<div className="fixed inset-0 z-52 flex items-center justify-center">
						{children}
					</div>
				</>
			)}
		</AnimatePresence>,
		document.body,
	);
}

export type MorphingDialogTitleProps = {
	children: React.ReactNode;
	className?: string;
	style?: React.CSSProperties;
};

function MorphingDialogTitle({
	children,
	className,
	style,
}: MorphingDialogTitleProps) {
	const { uniqueId } = useMorphingDialog();

	return (
		<m.div
			layoutId={`dialog-title-container-${uniqueId}`}
			className={className}
			style={style}
			layout
		>
			{children}
		</m.div>
	);
}

export type MorphingDialogSubtitleProps = {
	children: React.ReactNode;
	className?: string;
	style?: React.CSSProperties;
};

function MorphingDialogSubtitle({
	children,
	className,
	style,
}: MorphingDialogSubtitleProps) {
	const { uniqueId } = useMorphingDialog();

	return (
		<m.div
			layoutId={`dialog-subtitle-container-${uniqueId}`}
			className={className}
			style={style}
		>
			{children}
		</m.div>
	);
}

export type MorphingDialogDescriptionProps = {
	children: React.ReactNode;
	className?: string;
	disableLayoutAnimation?: boolean;
	variants?: {
		initial: Variant;
		animate: Variant;
		exit: Variant;
	};
};

function MorphingDialogDescription({
	children,
	className,
	variants,
	disableLayoutAnimation,
}: MorphingDialogDescriptionProps) {
	const { uniqueId } = useMorphingDialog();

	return (
		<m.div
			key={`dialog-description-${uniqueId}`}
			layoutId={
				disableLayoutAnimation
					? undefined
					: `dialog-description-content-${uniqueId}`
			}
			variants={variants}
			className={className}
			initial="initial"
			animate="animate"
			exit="exit"
			id={`dialog-description-${uniqueId}`}
		>
			{children}
		</m.div>
	);
}

export type MorphingDialogImageProps = {
	src: string;
	alt: string;
	className?: string;
	style?: React.CSSProperties;
};

function MorphingDialogImage({
	src,
	alt,
	className,
	style,
}: MorphingDialogImageProps) {
	const { uniqueId } = useMorphingDialog();

	return (
		<m.img
			src={src}
			alt={alt}
			className={cn(className)}
			layoutId={`dialog-img-${uniqueId}`}
			style={style}
		/>
	);
}

export type MorphingDialogCloseProps = {
	children?: React.ReactNode;
	className?: string;
	variants?: {
		initial: Variant;
		animate: Variant;
		exit: Variant;
	};
};

function MorphingDialogClose({
	children,
	className,
	variants,
}: MorphingDialogCloseProps) {
	const { setIsOpen, uniqueId } = useMorphingDialog();

	const handleClose = useCallback(() => {
		setIsOpen(false);
	}, [setIsOpen]);

	return (
		<m.button
			onClick={handleClose}
			type="button"
			aria-label="Close dialog"
			key={`dialog-close-${uniqueId}`}
			className={cn("fixed top-6 right-6", className)}
			initial="initial"
			animate="animate"
			exit="exit"
			variants={variants}
		>
			{children || <X size={24} />}
		</m.button>
	);
}

export {
	MorphingDialog,
	MorphingDialogTrigger,
	MorphingDialogContainer,
	MorphingDialogContent,
	MorphingDialogClose,
	MorphingDialogTitle,
	MorphingDialogSubtitle,
	MorphingDialogDescription,
	MorphingDialogImage,
};

import {
	ArchiveIcon,
	BrainIcon,
	CaretDownIcon,
	CaretRightIcon,
	EyeIcon,
	EyeSlashIcon,
	FilePdfIcon,
	ImagesIcon,
	KeyIcon,
	PushPinSimpleIcon,
	SketchLogoIcon,
} from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { ProviderIcon } from "@/components/common/provider-icon";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import {
	type EnrichedModel,
	useEnrichedModels,
} from "@/hooks/use-enriched-models";
import { useModelPreferences } from "@/hooks/use-model-preferences";
import { useModelSettings } from "@/hooks/use-model-settings";
import { MODELS_OPTIONS, PROVIDERS_OPTIONS } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useUser } from "@/providers/user-provider";
import { api } from "../../../convex/_generated/api";
import { ModelCard } from "./model-card";
import { ModelSelectorFooter } from "./model-selector-footer";
import { ModelSelectorSearchHeader } from "./model-selector-search-header";

type ModelSelectorProps = {
	selectedModelId: string;
	setSelectedModelId: (modelId: string) => void;
	className?: string;
};

export function ModelSelector({
	selectedModelId,
	setSelectedModelId,
	className,
}: ModelSelectorProps) {
	const { user, hasPremium, products } = useUser();
	const { toggleFavoriteModel } = useModelPreferences();
	const { categorizedModels } = useEnrichedModels();
	const { disabledModelsSet } = useModelSettings();
	const isMobile = useBreakpoint(768); // Use 768px as the breakpoint
	const generateCheckoutLink = useAction(api.polar.generateCheckoutLink);
	const router = useRouter();

	// State for dropdown, search, and extended mode
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [isExtendedMode, setIsExtendedMode] = useState(false);
	const [isLegacyExpanded, setIsLegacyExpanded] = useState(false);

	const handleSelect = useCallback(
		(id: string) => {
			setSelectedModelId(id);
			setIsOpen(false); // Close dropdown on selection
		},
		[setSelectedModelId],
	);

	// Determine if extended mode should be shown
	const isExtended = searchQuery.length > 0 || isExtendedMode;

	// Helper function to format display name with subName
	const getDisplayName = useCallback((modelName: string, subName?: string) => {
		return subName ? `${modelName} (${subName})` : modelName;
	}, []);

	// Optimized model filtering using pre-computed enriched models
	const {
		normalModeModels,
		favoritesModels,
		othersModels,
		disabledModels,
		legacyModels,
	} = useMemo(() => {
		const favorites = categorizedModels.favorites;

		// Filter others: exclude disabled, exclude legacy (unless favorited)
		let others = categorizedModels.others.filter(
			(model) => !disabledModelsSet.has(model.id) && !model.legacy,
		);

		// Get disabled models from settings (not unavailable models)
		let disabled = categorizedModels.all.filter((model) =>
			disabledModelsSet.has(model.id),
		);

		// Get legacy models (not favorited, not disabled)
		let legacy = categorizedModels.others.filter(
			(model) =>
				model.legacy &&
				!disabledModelsSet.has(model.id),
		);

		// Apply search filter if needed
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			const matchesSearch = (model: EnrichedModel) => {
				const displayName = getDisplayName(model.name, model.subName);
				const modelWithDisplayProvider = model as typeof model & {
					displayProvider?: string;
				};
				const displayProvider =
					modelWithDisplayProvider.displayProvider || model.provider;
				return (
					displayName.toLowerCase().includes(query) ||
					model.provider.toLowerCase().includes(query) ||
					displayProvider.toLowerCase().includes(query)
				);
			};

			others = others.filter(matchesSearch);
			disabled = disabled.filter(matchesSearch);
			legacy = legacy.filter(matchesSearch);

			return {
				normalModeModels: favorites.filter(matchesSearch),
				favoritesModels: favorites.filter(matchesSearch),
				othersModels: others,
				disabledModels: disabled,
				legacyModels: legacy,
			};
		}

		return {
			normalModeModels: favorites, // Normal mode shows only favorites
			favoritesModels: favorites,
			othersModels: others,
			disabledModels: disabled,
			legacyModels: legacy,
		};
	}, [categorizedModels, searchQuery, disabledModelsSet, getDisplayName]);

	// Handle toggle between normal and extended mode
	const handleToggleMode = useCallback(() => {
		if (isExtended && searchQuery) {
			// If in extended mode with search, clear search to go back to normal
			setSearchQuery("");
		} else {
			// Toggle extended mode
			setIsExtendedMode(!isExtendedMode);
		}
	}, [isExtended, searchQuery, isExtendedMode]);

	// Handle favorite toggle
	const handleToggleFavorite = useCallback(
		(modelId: string) => {
			toggleFavoriteModel(modelId);
		},
		[toggleFavoriteModel],
	);

	// Handle upgrade button click
	const handleUpgrade = useCallback(async () => {
		// Anonymous users: send to auth page
		if (user?.isAnonymous) {
			router.navigate({ to: "/auth" });
			return;
		}

		if (!products?.premium?.id) return;

		try {
			const { url } = await generateCheckoutLink({
				productIds: [products.premium.id],
				origin: window.location.origin,
				successUrl: `${window.location.origin}/settings?upgraded=true`,
			});

			window.location.href = url;
		} catch (error) {
			console.error("Checkout failed:", error);
		}
	}, [user, products, generateCheckoutLink, router]);

	const model = useMemo(() => {
		// Always look in the full MODELS_OPTIONS list, not just filtered results
		return MODELS_OPTIONS.find((model) => model.id === selectedModelId);
	}, [selectedModelId]);

	const provider = useMemo(
		() =>
			PROVIDERS_OPTIONS.find(
				(provider) =>
					provider.id === (model?.displayProvider || model?.provider),
			),
		[model],
	);

	const renderModelOption = useCallback(
		(modelOption: EnrichedModel) => {
			const providerOption = modelOption.providerInfo;
			// Optimized feature flags using pre-computed featuresMap
			const hasFileUpload = modelOption.featuresMap["file-upload"];
			const hasPdfProcessing = modelOption.featuresMap["pdf-processing"];
			const hasReasoning = modelOption.featuresMap["reasoning"];
			const hasImageGeneration = modelOption.featuresMap["image-generation"];

			// --- Style Definitions based on the provided HTML ---
			const iconWrapperBaseClasses =
				"relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-md cursor-help";
			const iconOverlayClasses =
				"absolute inset-0 bg-current opacity-20 dark:opacity-25"; // Uses parent's text color
			const iconSizeClasses = "h-4 w-4"; // Icon size is smaller than wrapper

			// Define the TEXT color classes for the wrapper (which icon and overlay inherit)
			const visionColorClasses = "text-teal-600 dark:text-teal-400";
			const pdfColorClasses = "text-indigo-600 dark:text-indigo-400"; // Matched to file-text example
			const reasoningColorClasses = "text-pink-600 dark:text-pink-400"; // Choosing pink for reasoning
			const imageGenerationColorClasses =
				"text-orange-600 dark:text-orange-400"; // Orange for image generation

			return (
				<DropdownMenuItem
					className={cn(
						"flex items-center justify-between px-3 py-2",
						!modelOption.available &&
							"cursor-not-allowed opacity-50 focus:bg-transparent",
						selectedModelId === modelOption.id && "bg-accent",
					)}
					key={modelOption.id}
					onClick={() => modelOption.available && handleSelect(modelOption.id)}
				>
					<div className="flex items-center gap-3">
						{providerOption && (
							<ProviderIcon className="size-5" provider={providerOption} />
						)}
						<div className="flex items-center gap-1.5">
							<span className="font-medium text-sm">
								{getDisplayName(modelOption.name, modelOption.subName)}
							</span>
							{modelOption.usesPremiumCredits && (
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="flex items-center">
											<SketchLogoIcon
												className="size-3 text-muted-foreground"
												weight="regular"
											/>
										</div>
									</TooltipTrigger>
									<TooltipContent side="top">
										<p>Premium Model</p>
									</TooltipContent>
								</Tooltip>
							)}
							{modelOption.apiKeyUsage.userKeyOnly && (
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="flex items-center">
											<KeyIcon className="size-3 text-muted-foreground" />
										</div>
									</TooltipTrigger>
									<TooltipContent side="top">
										<p>Requires API Key</p>
									</TooltipContent>
								</Tooltip>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2">
						{" "}
						{/* Gap between icons */}
						{hasFileUpload && (
							<Tooltip>
								<TooltipTrigger asChild>
									{/* Apply wrapper classes + specific text color */}
									<div
										className={cn(iconWrapperBaseClasses, visionColorClasses)}
									>
										{/* Overlay takes color via bg-current */}
										<div className={iconOverlayClasses} />
										{/* Icon is placed on top, inherits text color */}
										<EyeIcon
											className={cn(
												iconSizeClasses,
												"relative",
												visionColorClasses,
											)}
										/>{" "}
										{/* Added relative to ensure it's above overlay */}
									</div>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p>Supports Image Upload and Analysis</p>
								</TooltipContent>
							</Tooltip>
						)}
						{hasPdfProcessing && (
							<Tooltip>
								<TooltipTrigger asChild>
									<div className={cn(iconWrapperBaseClasses, pdfColorClasses)}>
										<div className={iconOverlayClasses} />
										<FilePdfIcon
											className={cn(
												iconSizeClasses,
												"relative",
												pdfColorClasses,
											)}
										/>
									</div>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p>Supports PDF Upload and Analysis</p>
								</TooltipContent>
							</Tooltip>
						)}
						{hasReasoning && (
							<Tooltip>
								<TooltipTrigger asChild>
									<div
										className={cn(
											iconWrapperBaseClasses,
											reasoningColorClasses,
										)}
									>
										<div className={iconOverlayClasses} />
										<BrainIcon
											className={cn(
												iconSizeClasses,
												"relative",
												reasoningColorClasses,
											)}
										/>
									</div>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p>Supports reasoning capabilities</p>
								</TooltipContent>
							</Tooltip>
						)}
						{hasImageGeneration && (
							<Tooltip>
								<TooltipTrigger asChild>
									<div
										className={cn(
											iconWrapperBaseClasses,
											imageGenerationColorClasses,
										)}
									>
										<div className={iconOverlayClasses} />
										<ImagesIcon
											className={cn(
												iconSizeClasses,
												"relative",
												imageGenerationColorClasses,
											)}
										/>
									</div>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p>Can generate images</p>
								</TooltipContent>
							</Tooltip>
						)}
					</div>
				</DropdownMenuItem>
			);
		},
		[selectedModelId, handleSelect, getDisplayName],
	);

	return (
		<DropdownMenu modal={false} onOpenChange={setIsOpen} open={isOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					className={cn("justify-between", isMobile && "py-3", className)}
					variant="outline"
				>
					<div className="flex items-center gap-2">
						{provider && (
							<ProviderIcon className="size-5" provider={provider} />
						)}
						{isMobile ? (
							<div className="flex flex-col items-start">
								<span className="text-sm leading-tight">
									{model?.name ?? "Select Model"}
								</span>
								{model?.subName && (
									<span className="text-muted-foreground text-xs leading-tight">
										{model.subName}
									</span>
								)}
							</div>
						) : (
							<span>
								{model
									? getDisplayName(model.name, model.subName)
									: "Select Model"}
							</span>
						)}
					</div>
					<CaretDownIcon className="size-4 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="!border-none relative flex max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-lg p-0 max-sm:mx-4 sm:rounded-lg"
				collisionPadding={16}
				side="top"
				sideOffset={4}
			>
				{/* Fixed Search Header */}
				<ModelSelectorSearchHeader
					onChange={setSearchQuery}
					value={searchQuery}
				/>

				{/* Animated Container - width/height animate together */}
				<motion.div
					initial={false}
					animate={{
						width: isExtended ? 640 : 420,
					}}
					transition={{
						duration: 0.15,
						ease: [0.4, 0, 0.2, 1],
					}}
					className="max-h-[60vh] overflow-y-auto overflow-x-hidden"
				>
					<div className="px-1.5 py-3">
						{/* Premium Upgrade Section */}
						{!hasPremium && (user?.isAnonymous || products?.premium?.id) && (
							<>
								<div className="p-3">
									<div className="rounded-lg border bg-card p-4">
										<div className="mb-2 font-semibold text-lg">
											Unlock all models + higher limits
										</div>
										<div className="flex items-center justify-between">
											<div className="font-bold text-2xl">
												$10
												<span className="font-normal text-muted-foreground text-sm">
													/month
												</span>
											</div>
											<Button
												className="cursor-pointer"
												onClick={handleUpgrade}
												size="sm"
											>
												Upgrade now
											</Button>
										</div>
									</div>
								</div>
								<div className="mx-2 my-1 border-border border-t" />
							</>
						)}

						{/* Content - no AnimatePresence, just conditional render for immediate height */}
						{isExtended ? (
							<motion.div
								key="extended"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.12 }}
								className="flex w-full flex-wrap justify-start gap-3.5 pt-2.5 pr-0 pb-4 pl-3"
							>
								{/* Favorites Section */}
								{favoritesModels.length > 0 && (
									<>
										<div className="-mb-2 ml-0 flex w-full select-none items-center justify-start gap-1.5 text-color-heading">
											<PushPinSimpleIcon className="mt-px size-4" />
											Favorites
										</div>
										{favoritesModels.map((modelOption, index) => (
											<motion.div
												key={modelOption.id}
												initial={{ opacity: 0, scale: 0.9 }}
												animate={{ opacity: 1, scale: 1 }}
												transition={{
													duration: 0.15,
													delay: 0.08 + index * 0.015,
													ease: [0.4, 0, 0.2, 1],
												}}
											>
												<ModelCard
													isDisabled={!modelOption.available}
													isFavorite={true}
													isLastFavorite={favoritesModels.length === 1}
													isSelected={selectedModelId === modelOption.id}
													model={modelOption}
													onSelect={handleSelect}
													onToggleFavorite={handleToggleFavorite}
												/>
											</motion.div>
										))}
									</>
								)}

								{/* Others Section */}
								{othersModels.length > 0 && (
									<>
										<div className="-mb-2 mt-1 ml-2 w-full select-none text-color-heading">
											Others
										</div>
										{othersModels.map((modelOption, index) => (
											<motion.div
												key={modelOption.id}
												initial={{ opacity: 0, scale: 0.9 }}
												animate={{ opacity: 1, scale: 1 }}
												transition={{
													duration: 0.15,
													delay:
														0.08 + (favoritesModels.length + index) * 0.015,
													ease: [0.4, 0, 0.2, 1],
												}}
											>
												<ModelCard
													isDisabled={!modelOption.available}
													isFavorite={false}
													isLastFavorite={false}
													isSelected={selectedModelId === modelOption.id}
													model={modelOption}
													onSelect={handleSelect}
													onToggleFavorite={handleToggleFavorite}
												/>
											</motion.div>
										))}
									</>
								)}

								{/* Disabled Section */}
								{disabledModels.length > 0 && (
									<>
										<div className="-mb-2 mt-1 ml-2 flex w-full select-none items-center justify-start gap-1.5 text-color-heading">
											<EyeSlashIcon className="mt-px size-4" />
											Disabled
										</div>
										{disabledModels.map((modelOption, index) => (
											<motion.div
												key={modelOption.id}
												initial={{ opacity: 0, scale: 0.9 }}
												animate={{ opacity: 1, scale: 1 }}
												transition={{
													duration: 0.15,
													delay:
														0.08 +
														(favoritesModels.length +
															othersModels.length +
															index) *
															0.015,
													ease: [0.4, 0, 0.2, 1],
												}}
											>
												<ModelCard
													isDisabled={true}
													isFavorite={false}
													isLastFavorite={false}
													isSelected={selectedModelId === modelOption.id}
													model={modelOption}
													onSelect={handleSelect}
													onToggleFavorite={handleToggleFavorite}
												/>
											</motion.div>
										))}
									</>
									)}

									{/* Legacy Models Section - Collapsible */}
									{legacyModels.length > 0 && (
										<>
											<button
													type="button"
													onClick={() => setIsLegacyExpanded(!isLegacyExpanded)}
													className="-mb-2 mt-3 ml-2 flex w-full cursor-pointer select-none items-center justify-start gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
												>
													<ArchiveIcon className="mt-px size-4" />
													Legacy Models ({legacyModels.length})
													{isLegacyExpanded ? (
														<CaretDownIcon className="mt-px size-4" />
													) : (
														<CaretRightIcon className="mt-px size-4" />
													)}
												</button>
											{isLegacyExpanded &&
												legacyModels.map((modelOption, index) => (
													<motion.div
														key={modelOption.id}
														initial={{ opacity: 0, scale: 0.9 }}
														animate={{ opacity: 1, scale: 1 }}
														transition={{
															duration: 0.15,
															delay: index * 0.015,
															ease: [0.4, 0, 0.2, 1],
														}}
													>
														<ModelCard
															isDisabled={!modelOption.available}
															isFavorite={false}
															isLastFavorite={false}
															isSelected={selectedModelId === modelOption.id}
															model={modelOption}
															onSelect={handleSelect}
															onToggleFavorite={handleToggleFavorite}
														/>
													</motion.div>
												))}
										</>
										)}
										</motion.div>
										) : (
							<motion.div
								key="normal"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.1 }}
							>
								{normalModeModels.map((modelOption) =>
									renderModelOption(modelOption),
								)}
							</motion.div>
						)}
					</div>
				</motion.div>

				{/* Fixed Footer */}
				<ModelSelectorFooter
					isExtended={isExtended}
					onToggleMode={handleToggleMode}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

import {
	ArchiveIcon,
	BrainIcon,
	CaretDownIcon,
	CheckIcon,
	EyeIcon,
	FadersHorizontalIcon,
	FilePdfIcon,
	FunnelIcon,
	ImagesIcon,
	InfoIcon,
	LightningIcon,
	MagnifyingGlassIcon,
	SketchLogoIcon,
	StarIcon,
	WrenchIcon,
} from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { ProviderIcon } from "@/components/common/provider-icon";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
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
import {
	getModelUnavailableReasons,
	getNormalizedSearchQuery,
	getLegacyScopeKey,
	getProviderFilter,
	isUnpinningLastFavoriteModel,
	shouldShowFavoritesOnly,
	shouldHideProviderSidebar,
} from "./model-selector-v2.utils";

type ModelSelectorV2Props = {
	selectedModelId: string;
	setSelectedModelId: (modelId: string) => void;
	className?: string;
};

export function ModelSelectorV2({
	selectedModelId,
	setSelectedModelId,
	className,
}: ModelSelectorV2Props) {
	const { user, hasPremium, products } = useUser();
	const { toggleFavoriteModel, favoriteModelsSet } = useModelPreferences();
	const { categorizedModels } = useEnrichedModels();
	const { disabledModelsSet } = useModelSettings();
	const isMobile = useBreakpoint(768);
	const generateCheckoutLink = useAction(api.polar.generateCheckoutLink);
	const router = useRouter();

	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [activeProvider, setActiveProvider] = useState<string | null>(null);
	const [legacyExpandedByScope, setLegacyExpandedByScope] = useState<
		Record<string, boolean>
	>({});
	const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
	const [showCombined, setShowCombined] = useState(false);
	const [showProviderScrollHint, setShowProviderScrollHint] = useState(false);
	const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
	const providerSidebarRef = useRef<HTMLDivElement | null>(null);
	const providerSidebarResizeObserverRef = useRef<ResizeObserver | null>(null);
	const normalizedSearchQuery = getNormalizedSearchQuery(searchQuery);
	const shouldHideSidebar = shouldHideProviderSidebar(
		normalizedSearchQuery,
		activeFilters,
	);

	const updateProviderScrollHint = useCallback((sidebar?: HTMLDivElement) => {
		const node = sidebar ?? providerSidebarRef.current;
		if (!node) {
			setShowProviderScrollHint(false);
			return;
		}
		const hasOverflow = node.scrollHeight - node.clientHeight > 1;
		const remainingScroll =
			node.scrollHeight - node.clientHeight - node.scrollTop;
		setShowProviderScrollHint(hasOverflow && remainingScroll > 2);
	}, []);

	const setProviderSidebarNode = useCallback(
		(node: HTMLDivElement | null) => {
			providerSidebarResizeObserverRef.current?.disconnect();
			providerSidebarResizeObserverRef.current = null;
			providerSidebarRef.current = node;

			if (!node || !isOpen || shouldHideSidebar) {
				setShowProviderScrollHint(false);
				return;
			}

			updateProviderScrollHint(node);

			const observer = new ResizeObserver(() => {
				updateProviderScrollHint(node);
			});
			observer.observe(node);
			providerSidebarResizeObserverRef.current = observer;
		},
		[isOpen, shouldHideSidebar, updateProviderScrollHint],
	);

	const handleOpenChange = useCallback((open: boolean) => {
		setIsOpen(open);
		if (open) {
			requestAnimationFrame(() => updateProviderScrollHint());
		}
		if (!open) {
			setSearchQuery("");
			setActiveProvider(null);
			setLegacyExpandedByScope({});
			setActiveFilters(new Set());
			setShowCombined(false);
			setShowProviderScrollHint(false);
		}
	}, [updateProviderScrollHint]);

	const availableProviders = useMemo(() => {
		const providerIds = new Set<string>();
		for (const m of categorizedModels.all) {
			if (m.providerInfo?.id) providerIds.add(m.providerInfo.id);
		}
		const order = [
			"openai",
			"anthropic",
			"gemini",
			"meta",
			"deepseek",
			"xai",
			"qwen",
			"moonshotai",
			"z-ai",
			"minimax",
			"openrouter",
		];
		const orderMap = new Map(order.map((id, i) => [id, i]));
		return PROVIDERS_OPTIONS.filter((p) => providerIds.has(p.id)).sort(
			(a, b) =>
				(orderMap.get(a.id) ?? order.length) -
				(orderMap.get(b.id) ?? order.length),
		);
	}, [categorizedModels.all]);

	const providerFilter = getProviderFilter(
		normalizedSearchQuery,
		activeFilters,
		activeProvider,
	);
	const isFavoritesScope = shouldShowFavoritesOnly(
		normalizedSearchQuery,
		activeFilters,
		activeProvider,
	);
	const legacyScopeKey = getLegacyScopeKey(providerFilter);
	const isLegacyExpanded = legacyExpandedByScope[legacyScopeKey] ?? false;

	const { mainModels, legacyModels } = useMemo(() => {
		let main: EnrichedModel[];
		let legacy: EnrichedModel[];

		if (isFavoritesScope) {
			main = [...categorizedModels.favorites];
			legacy = [];
		} else {
			main = [
				...categorizedModels.favorites,
				...categorizedModels.others.filter(
					(m) => !disabledModelsSet.has(m.id) && !m.legacy,
				),
			];
			legacy = categorizedModels.others.filter(
				(m) => m.legacy && !disabledModelsSet.has(m.id),
			);

			if (providerFilter) {
				const match = (m: EnrichedModel) =>
					m.providerInfo?.id === providerFilter;
				main = main.filter(match);
				legacy = legacy.filter(match);
			}
		}

		if (normalizedSearchQuery) {
			const q = normalizedSearchQuery;
			const match = (m: EnrichedModel) => {
				const name = m.subName ? `${m.name} ${m.subName}` : m.name;
				return (
					name.toLowerCase().includes(q) ||
					m.provider.toLowerCase().includes(q) ||
					m.description?.toLowerCase().includes(q)
				);
			};
			main = main.filter(match);
			legacy = legacy.filter(match);
		}

		// Feature filters
		if (activeFilters.size > 0) {
			const selected = FILTER_OPTIONS.filter((f) =>
				activeFilters.has(f.id),
			);
			const match = (m: EnrichedModel) =>
				showCombined
					? selected.every((f) => f.match(m))
					: selected.some((f) => f.match(m));
			main = main.filter(match);
			legacy = legacy.filter(match);
		}

		return { mainModels: main, legacyModels: legacy };
	}, [
		categorizedModels,
		disabledModelsSet,
		isFavoritesScope,
		providerFilter,
		normalizedSearchQuery,
		activeFilters,
		showCombined,
	]);

	const handleSelect = useCallback(
		(id: string) => {
			setSelectedModelId(id);
			setIsOpen(false);
		},
		[setSelectedModelId],
	);

	const handleToggleFavorite = useCallback(
		(modelId: string) => {
			const isFavorite = favoriteModelsSet.has(modelId);
			if (isUnpinningLastFavoriteModel(isFavorite, favoriteModelsSet.size)) {
				return;
			}
			void toggleFavoriteModel(modelId).catch((error) => {
				console.error("Failed to toggle favorite model:", error);
			});
		},
		[favoriteModelsSet, toggleFavoriteModel],
	);

	const handleToggleFilter = useCallback((filterId: string) => {
		setActiveFilters((prev) => {
			const next = new Set(prev);
			if (next.has(filterId)) {
				next.delete(filterId);
			} else {
				next.add(filterId);
			}
			return next;
		});
	}, []);

	const handleUpgrade = useCallback(async () => {
		if (isUpgradeLoading) {
			return;
		}
		if (user?.isAnonymous) {
			router.navigate({ to: "/auth" });
			return;
		}
		if (!products?.premium?.id) return;
		setIsUpgradeLoading(true);
		try {
			const { url } = await generateCheckoutLink({
				productIds: [products.premium.id],
				origin: window.location.origin,
				successUrl: `${window.location.origin}/settings?upgraded=true`,
			});
			window.location.href = url;
		} catch (error) {
			console.error("Checkout failed:", error);
			toast({
				title: "Checkout unavailable",
				description: "Unable to start checkout. Please try again.",
				status: "error",
			});
		} finally {
			setIsUpgradeLoading(false);
		}
	}, [
		user?.isAnonymous,
		products?.premium?.id,
		generateCheckoutLink,
		isUpgradeLoading,
		router,
	]);

	const model = useMemo(
		() => MODELS_OPTIONS.find((m) => m.id === selectedModelId),
		[selectedModelId],
	);

	const provider = useMemo(
		() =>
			PROVIDERS_OPTIONS.find(
				(p) => p.id === (model?.displayProvider || model?.provider),
			),
		[model],
	);

	const displayName = model?.subName
		? `${model.name} (${model.subName})`
		: model?.name;
	const isHomeRoute = router.state.location.pathname === "/";

	return (
		<Popover open={isOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
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
							<span>{displayName ?? "Select Model"}</span>
						)}
					</div>
					<CaretDownIcon className="size-4 opacity-50" />
				</Button>
			</PopoverTrigger>

			<PopoverContent
				forceMount
				align={isMobile ? "center" : "start"}
				side={isHomeRoute ? "bottom" : "top"}
				sticky="always"
				sideOffset={4}
				collisionPadding={isMobile ? 6 : 16}
				className={cn(
					"flex w-[460px] max-w-screen flex-col overflow-hidden rounded-xl border-chat-border bg-background/69 p-0 shadow-2xl backdrop-blur-md max-sm:w-[calc(100vw-0.75rem)] max-sm:max-w-[calc(100vw-0.75rem)]",
					"data-[state=open]:duration-120 data-[state=closed]:duration-90 data-[state=open]:ease-out data-[state=closed]:ease-in",
					"data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1",
					"motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none",
				)}
				style={{
					maxHeight: "min(85dvh, var(--radix-popover-content-available-height))",
				}}
			>
				<div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl">
					{/* Decorative overlays */}
					<div
						className="absolute inset-0 opacity-0 dark:opacity-50"
						style={{
							background:
								"linear-gradient(135deg, hsl(var(--primary) / 0.08), transparent 60%)",
						}}
					/>
					<div className="absolute inset-0 bg-[url('/images/noise.png')] opacity-[0.03]" />

					<div className="relative flex min-h-0 flex-1 flex-col">
						{/* Upgrade banner */}
						{!hasPremium &&
							(user?.isAnonymous || products?.premium?.id) && (
								<div className="relative overflow-hidden bg-gradient-to-r from-pink-400/[0.05] via-pink-400/[0.08] to-pink-400/[0.04]">
									<div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-pink-300/15 to-transparent" />
									<div className="flex items-center gap-3 px-4 py-2.5">
										<div className="flex size-8 shrink-0 items-center justify-center rounded-lg animate-[gem-shine_2.5s_ease-in-out_infinite]">
											<SketchLogoIcon
												className="size-6 text-pink-400 dark:text-pink-300"
												weight="duotone"
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="font-semibold text-[13px] leading-tight">
												Unlock all models
											</p>
											<p className="mt-0.5 text-xs leading-tight">
												<span className="font-semibold text-pink-400 dark:text-pink-300">$10</span>
												<span className="text-muted-foreground/50">/mo</span>
											</p>
										</div>
											<Button
												size="sm"
												variant="outline"
												onClick={handleUpgrade}
												disabled={isUpgradeLoading}
												className="h-7 cursor-pointer rounded-lg border-pink-400/20 bg-pink-400/8 px-3 text-xs font-medium text-pink-400 transition-colors hover:border-pink-400/30 hover:bg-pink-400/15 hover:text-pink-300 dark:text-pink-300"
											>
												{isUpgradeLoading ? "Opening..." : "Upgrade"}
											</Button>
									</div>
								</div>
							)}

						{/* Search bar - full width */}
						<div className="flex items-center gap-2 px-4 pt-3 pb-2">
							<div className="flex flex-1 items-center border-chat-border/50 border-b pb-1">
								<MagnifyingGlassIcon className="mr-2.5 size-4 shrink-0 text-muted-foreground/60" />
								<input
									aria-label="Search models"
									className="w-full bg-transparent py-1.5 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none"
									onChange={(e) => setSearchQuery(e.target.value)}
									placeholder="Search models..."
									role="searchbox"
									type="text"
									value={searchQuery}
								/>
							</div>
							<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									className={cn(
										"relative size-9 shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
										activeFilters.size > 0 && "text-foreground",
									)}
								>
									<FunnelIcon
										className="mx-auto size-4"
										weight={activeFilters.size > 0 ? "fill" : "regular"}
									/>
									{activeFilters.size > 0 && (
										<span className="absolute top-1 right-1 size-2 rounded-full bg-primary" />
									)}
								</button>
							</PopoverTrigger>
							<PopoverContent
								align="end"
								side="bottom"
								sideOffset={4}
								className="w-56 border-chat-border bg-background p-1.5"
								onOpenAutoFocus={(e) => e.preventDefault()}
							>
								<div className="space-y-0.5">
									{FILTER_OPTIONS.map((filter) => (
										<button
											key={filter.id}
											type="button"
											className={cn(
												"flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent/60",
												activeFilters.has(filter.id) &&
													"bg-sidebar-accent/40",
											)}
											onClick={() => handleToggleFilter(filter.id)}
										>
											<div
												className="relative flex size-6.5 items-center justify-center overflow-hidden rounded-full"
												style={
													{
														"--color": filter.color,
														"--color-dark": filter.colorDark,
													} as React.CSSProperties
												}
											>
												<div className="absolute inset-0 bg-current opacity-20 dark:opacity-10" />
												<filter.Icon className="relative size-3.5 text-[var(--color)] dark:text-[var(--color-dark)]" />
											</div>
											<span className="flex-1">{filter.label}</span>
											{activeFilters.has(filter.id) && (
												<CheckIcon className="size-4 shrink-0 text-foreground" weight="bold" />
											)}
										</button>
									))}
									<div className="my-1 h-px bg-border/60" />
									<button
										type="button"
										className={cn(
											"flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent/60",
											showCombined && "bg-sidebar-accent/40",
										)}
										onClick={() => setShowCombined(!showCombined)}
									>
										<span className="flex-1">Show combined results</span>
									</button>
								</div>
							</PopoverContent>
						</Popover>
						</div>

						{/* Two-column layout */}
						<div className="flex h-[426px] min-h-0 max-h-[calc(100dvh-14rem)]">
							{/* Provider sidebar */}
								{!shouldHideSidebar && (
									<div className="relative h-full w-14 shrink-0">
										<div
											key={`provider-sidebar-${availableProviders.length}`}
											ref={setProviderSidebarNode}
											onScroll={(e) =>
												updateProviderScrollHint(e.currentTarget)
											}
											className="no-scrollbar flex h-full max-h-full w-14 flex-col items-center overflow-x-hidden overflow-y-auto rounded-tr-xl border border-chat-border border-b-0 border-l-0 bg-sidebar-accent/30"
										>
										{/* Favorites icon */}
										<div className="p-1">
											<div className="flex flex-col items-center gap-1">
												<SidebarProviderButton
													active={activeProvider === null}
													label="Favorites"
													onClick={() => setActiveProvider(null)}
												>
													<StarIcon
														className="size-5"
														weight={
															activeProvider === null ? "fill" : "regular"
														}
													/>
												</SidebarProviderButton>
													<div
														aria-hidden="true"
														className="my-1 h-px w-8 bg-border/90"
													/>
											</div>
										</div>

										{/* Provider icons */}
										{availableProviders.map((p) => (
											<SidebarProviderButton
												key={p.id}
												active={activeProvider === p.id}
												label={p.name}
												onClick={() =>
													setActiveProvider(
														activeProvider === p.id ? null : p.id,
													)
												}
											>
												<ProviderIcon
													className={cn(
														"size-5 transition-[filter,opacity]",
														activeProvider === p.id
															? "opacity-100"
															: "grayscale brightness-0 opacity-40 dark:invert group-hover:grayscale-0 group-hover:brightness-100 group-hover:opacity-100 group-hover:dark:invert-0",
													)}
													provider={p}
												/>
											</SidebarProviderButton>
										))}
									</div>

										{/* Bottom gradient fade */}
										{showProviderScrollHint && (
											<div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-16 flex-col items-center justify-end bg-gradient-to-t from-sidebar-accent/90 to-transparent pb-1.5 opacity-100 transition-opacity duration-150">
												<CaretDownIcon className="size-4 animate-bounce text-muted-foreground" />
											</div>
										)}
									</div>
								)}

							{/* Model list */}
							<div className="relative min-h-0 flex-1 overflow-hidden">
								<div className="no-scrollbar h-full overflow-x-hidden overflow-y-auto p-2">
										<div className="space-y-0.5">
											{mainModels.map((m) => (
												<ModelRow
													key={m.id}
													model={m}
													isFavorite={favoriteModelsSet.has(m.id)}
													favoriteModelsCount={favoriteModelsSet.size}
													isSelected={selectedModelId === m.id}
													onSelect={handleSelect}
													onToggleFavorite={handleToggleFavorite}
												/>
											))}

										{/* Legacy models */}
										{legacyModels.length > 0 && (
											<>
												<button
													type="button"
													className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-muted-foreground/80 text-xs transition-colors hover:bg-sidebar-accent/50 hover:text-muted-foreground"
													onClick={() =>
														setLegacyExpandedByScope((prev) => ({
															...prev,
															[legacyScopeKey]: !isLegacyExpanded,
														}))
													}
												>
													<ArchiveIcon className="size-4" />
													<span>
														{legacyModels.length} legacy models
													</span>
													<CaretDownIcon
														className={cn(
															"ml-auto size-4 text-muted-foreground/60 transition-transform",
															!isLegacyExpanded && "-rotate-90",
														)}
													/>
												</button>
												{isLegacyExpanded &&
													legacyModels.map((m) => (
														<ModelRow
															key={m.id}
															model={m}
															isFavorite={favoriteModelsSet.has(m.id)}
															favoriteModelsCount={favoriteModelsSet.size}
															isSelected={selectedModelId === m.id}
															onSelect={handleSelect}
															onToggleFavorite={handleToggleFavorite}
														/>
													))}
											</>
										)}

										{mainModels.length === 0 &&
											legacyModels.length === 0 && (
												<div className="px-4 py-12 text-center text-muted-foreground/50 text-sm">
													No models found
												</div>
											)}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

// Sidebar provider icon button with active indicator pill
function SidebarProviderButton({
	active,
	label,
	onClick,
	children,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					className="group relative flex size-11 shrink-0 items-center justify-center rounded-xl transition-all hover:bg-sidebar-accent/80"
					onClick={onClick}
				>
					<div
						className={cn(
							"-right-1.5 absolute top-1/2 h-6 w-0.5 -translate-y-1/2 translate-x-[0.5px] rounded-l-full bg-primary transition-opacity duration-150",
							active ? "opacity-100" : "opacity-0",
						)}
					/>
					<div className="relative">{children}</div>
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">
				<p>{label}</p>
			</TooltipContent>
		</Tooltip>
	);
}

// Feature capability colors using CSS custom properties
const FEATURE_STYLES = {
	"file-upload": {
		color: "hsl(168 54% 52%)",
		colorDark: "hsl(168 54% 74%)",
		label: "Vision",
		Icon: EyeIcon,
	},
	reasoning: {
		color: "hsl(263 58% 53%)",
		colorDark: "hsl(263 58% 75%)",
		label: "Reasoning",
		Icon: BrainIcon,
	},
	"pdf-processing": {
		color: "hsl(237 55% 57%)",
		colorDark: "hsl(237 75% 77%)",
		label: "PDF",
		Icon: FilePdfIcon,
	},
	"image-generation": {
		color: "hsl(12 60% 45%)",
		colorDark: "hsl(12 60% 60%)",
		label: "Image Gen",
		Icon: ImagesIcon,
	},
} as const;

type FeatureId = keyof typeof FEATURE_STYLES;

// Pre-compute effort-control model IDs for type-safe matching
const EFFORT_MODELS = new Set(
	MODELS_OPTIONS.filter((m) =>
		m.features.some((f) => f.id === "reasoning" && f.supportsEffort),
	).map((m) => m.id),
);

const FILTER_OPTIONS = [
	{
		id: "fast",
		label: "Fast",
		Icon: LightningIcon,
		color: "hsl(46 77% 52%)",
		colorDark: "hsl(46 77% 79%)",
		match: (m: EnrichedModel) => !m.featuresMap.reasoning,
	},
	{
		id: "vision",
		label: "Vision",
		Icon: EyeIcon,
		color: "hsl(168 54% 52%)",
		colorDark: "hsl(168 54% 74%)",
		match: (m: EnrichedModel) => !!m.featuresMap["file-upload"],
	},
	{
		id: "reasoning",
		label: "Reasoning",
		Icon: BrainIcon,
		color: "hsl(263 58% 53%)",
		colorDark: "hsl(263 58% 75%)",
		match: (m: EnrichedModel) => !!m.featuresMap.reasoning,
	},
	{
		id: "effort-control",
		label: "Effort Control",
		Icon: FadersHorizontalIcon,
		color: "hsl(304 44% 51%)",
		colorDark: "hsl(304 44% 72%)",
		match: (m: EnrichedModel) => EFFORT_MODELS.has(m.id),
	},
	{
		id: "tool-calling",
		label: "Tool Calling",
		Icon: WrenchIcon,
		color: "hsl(10 54% 54%)",
		colorDark: "hsl(10 74% 74%)",
		match: (m: EnrichedModel) => !!m.featuresMap["tool-calling"],
	},
	{
		id: "image-generation",
		label: "Image Generation",
		Icon: ImagesIcon,
		color: "hsl(12 60% 45%)",
		colorDark: "hsl(12 60% 60%)",
		match: (m: EnrichedModel) => !!m.featuresMap["image-generation"],
	},
	{
		id: "pdf",
		label: "PDF Comprehension",
		Icon: FilePdfIcon,
		color: "hsl(237 55% 57%)",
		colorDark: "hsl(237 75% 77%)",
		match: (m: EnrichedModel) => !!m.featuresMap["pdf-processing"],
	},
];

// Individual model row
const ModelRow = memo(function ModelRow({
	model,
	isFavorite,
	favoriteModelsCount,
	isSelected,
	onSelect,
	onToggleFavorite,
}: {
	model: EnrichedModel;
	isFavorite: boolean;
	favoriteModelsCount: number;
	isSelected: boolean;
	onSelect: (id: string) => void;
	onToggleFavorite: (id: string) => void;
}) {
	const displayName = model.subName
		? `${model.name} (${model.subName})`
		: model.name;

	const shortDesc = model.description?.split("\n")[0]?.substring(0, 90);

	// Collect active features
	const activeFeatures = useMemo(() => {
		const features: FeatureId[] = [];
		for (const id of Object.keys(FEATURE_STYLES) as FeatureId[]) {
			if (model.featuresMap[id]) features.push(id);
		}
		return features;
	}, [model.featuresMap]);

	const handleClick = useCallback(() => {
		if (model.available) onSelect(model.id);
	}, [model.available, model.id, onSelect]);

	const isUnpinDisabled = isUnpinningLastFavoriteModel(
		isFavorite,
		favoriteModelsCount,
	);
	const unavailableReasons = getModelUnavailableReasons({
		available: model.available,
		premium: model.premium,
		userKeyOnly: model.apiKeyUsage.userKeyOnly,
	});

	const handleStarClick = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			e.preventDefault();
			e.stopPropagation();
			if (isUnpinDisabled) {
				return;
			}
			onToggleFavorite(model.id);
		},
		[isUnpinDisabled, model.id, onToggleFavorite],
	);

	const rowButton = (
		<button
					type="button"
					data-model-item="true"
					aria-disabled={!model.available}
				className={cn(
					"group flex h-16 w-full items-center gap-3 rounded-lg pt-1.5 pr-1.5 pb-2.5 pl-3 text-left transition-all hover:bg-sidebar-accent/60",
					"focus-visible:bg-sidebar-accent/40 focus-visible:ring-2 focus-visible:ring-primary/50",
					isSelected && "bg-sidebar-accent/60",
					!model.available && "cursor-not-allowed opacity-40",
				)}
				onClick={handleClick}
				disabled={!model.available}
			>
				<div className="min-w-0 flex-1">
					{/* Name row */}
					<div className="flex items-center gap-2">
						<p className="text-md truncate font-semibold">{displayName}</p>

						{/* Premium gem badge */}
						{model.usesPremiumCredits && (
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="inline-flex opacity-70">
										<SketchLogoIcon
											className="size-3.5 text-pink-500 dark:text-pink-400"
											weight="duotone"
										/>
									</span>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p>Premium</p>
								</TooltipContent>
							</Tooltip>
						)}

						{/* Star toggle */}
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										className={cn(
											"group/star shrink-0 rounded p-1 text-muted-foreground/80 transition-colors focus-visible:ring-2 focus-visible:ring-primary/50",
											!isUnpinDisabled &&
												"cursor-pointer hover:text-yellow-600",
											isUnpinDisabled && "cursor-not-allowed opacity-50",
										)}
										aria-label={
											isUnpinDisabled
												? "Must keep at least one favorite model"
												: isFavorite
													? "Remove from favorites"
													: "Add to favorites"
										}
										disabled={isUnpinDisabled}
										onClick={handleStarClick}
									>
										<StarIcon
											className={cn(
												"size-4 transition-all",
												isFavorite &&
													"fill-yellow-500 text-yellow-600 dark:fill-yellow-400 dark:text-yellow-400",
											)}
											weight={isFavorite ? "fill" : "regular"}
										/>
									</button>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p>
										{isUnpinDisabled
											? "Must keep at least one favorite model"
											: isFavorite
												? "Remove from favorites"
												: "Add to favorites"}
									</p>
								</TooltipContent>
							</Tooltip>

						{/* Feature badges pill */}
						{activeFeatures.length > 0 && (
							<div className="ml-auto flex items-center gap-0.5 rounded-full bg-muted-foreground/8 p-0.75">
								{activeFeatures.map((featureId) => {
									const style = FEATURE_STYLES[featureId];
									return (
										<Tooltip key={featureId}>
											<TooltipTrigger asChild>
												<span className="inline-flex">
													<div
														className="relative flex size-5 items-center justify-center overflow-hidden"
														style={
															{
																"--feat-color": style.color,
																"--feat-color-dark":
																	style.colorDark,
																color: `var(--feat-color)`,
															} as React.CSSProperties
														}
													>
														<style.Icon className="size-3.5 text-[var(--feat-color)] dark:text-[var(--feat-color-dark)]" />
													</div>
												</span>
											</TooltipTrigger>
											<TooltipContent side="top">
												<p>{style.label}</p>
											</TooltipContent>
										</Tooltip>
									);
								})}
							</div>
						)}
					</div>

					{/* Description row */}
					<div className="relative">
						{shortDesc && (
							<p className="mt-0.5 truncate pr-16 pl-[0.25px] text-muted-foreground/60 text-xs">
								{shortDesc}
							</p>
						)}
						{/* Info button on hover */}
						<div className="absolute top-0 right-0 flex shrink-0 items-center gap-1">
								<Tooltip>
									<TooltipTrigger asChild>
										<span
											role="button"
											tabIndex={0}
											onClick={(event) => {
												event.preventDefault();
												event.stopPropagation();
											}}
											onKeyDown={(event) => {
												if (event.key === "Enter" || event.key === " ") {
													event.preventDefault();
													event.stopPropagation();
												}
											}}
											className="hidden shrink-0 cursor-pointer rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 md:block"
											aria-label="View model details"
										>
										<InfoIcon className="size-4" />
									</span>
								</TooltipTrigger>
								<TooltipContent side="top">
									<p>{model.description?.split("\n")[0]}</p>
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
				</div>
		</button>
	);

	return (
		<div>
			{unavailableReasons.length > 0 ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<div>{rowButton}</div>
					</TooltipTrigger>
					<TooltipContent side="top">
						<div className="space-y-0.5">
							{unavailableReasons.map((reason) => (
								<p key={reason}>{reason}</p>
							))}
						</div>
					</TooltipContent>
				</Tooltip>
			) : (
				rowButton
			)}
		</div>
	);
});

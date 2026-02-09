import {
	ArrowSquareOut,
	CaretDown,
	CaretUp,
	Globe,
} from "@phosphor-icons/react";
import { memo, useDeferredValue, useState } from "react";
import { Markdown } from "@/components/prompt-kit/markdown";
import { cn } from "@/lib/utils";

// Regex pattern defined at top level for performance
const WWW_PREFIX_REGEX = /^www\./;

type SearchResult = {
	url: string;
	title: string;
	description: string;
	content?: string;
	markdown?: string;
};

type SearchResultsProps = {
	results: SearchResult[];
	isLoading?: boolean;
	error?: string;
};

export const SearchResults = memo(
	function SearchResultsComponent({
		results,
		isLoading,
		error,
	}: SearchResultsProps) {
		const [expandedResults, setExpandedResults] = useState<Set<string>>(
			new Set(),
		);
		const deferred = useDeferredValue(results);

		const toggleExpanded = (url: string) => {
			const newExpanded = new Set(expandedResults);
			if (newExpanded.has(url)) {
				newExpanded.delete(url);
			} else {
				newExpanded.add(url);
			}
			setExpandedResults(newExpanded);
		};

		if (isLoading) {
			return (
				<div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
					<div className="flex items-center gap-2">
						<Globe className="size-4 animate-pulse text-primary" />
						<span className="font-medium text-primary">
							Searching the web...
						</span>
					</div>
				</div>
			);
		}

		if (error) {
			return (
				<div className="flex flex-col gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
					<div className="flex items-center gap-2">
						<Globe className="size-4 text-destructive" />
						<span className="font-medium text-destructive">Search failed</span>
					</div>
					<p className="text-muted-foreground text-sm">{error}</p>
				</div>
			);
		}

		if (!deferred || deferred.length === 0) {
			return (
				<div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
					<div className="flex items-center gap-2">
						<Globe className="size-4 text-muted-foreground" />
						<span className="font-medium text-muted-foreground">
							No results found
						</span>
					</div>
				</div>
			);
		}

		return (
			<div className="flex flex-col gap-2">
				<div className="mb-2 flex items-center gap-2">
					<Globe className="size-4 text-primary" />
					<span className="font-medium text-primary">Web Search</span>
					<span className="text-muted-foreground text-sm">
						• {deferred.length} results
					</span>
				</div>

				<div className="space-y-2" style={{ contentVisibility: "auto" }}>
					{deferred.map((result) => {
						const isExpanded = expandedResults.has(result.url);
						const content = result.content ?? "";
						const showExpandedContent = isExpanded ? content.length > 0 : false;
						const domain = new URL(result.url).hostname.replace(
							WWW_PREFIX_REGEX,
							"",
						);

						return (
							<div
								className={cn(
									"group rounded-lg border bg-card transition-all hover:shadow-sm",
									isExpanded ? "shadow-sm" : "",
								)}
								key={result.url}
							>
								<button
									className="w-full rounded-lg p-4 text-left focus:outline-none focus:ring-2 focus:ring-primary/20"
									onClick={() => toggleExpanded(result.url)}
									type="button"
								>
									<div className="flex items-start gap-3">
										<img
											alt=""
											className="mt-0.5 size-5 rounded"
											decoding="async"
											height={20}
											loading="lazy"
											referrerPolicy="no-referrer"
											src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
											width={20}
										/>

										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<h3 className="truncate font-medium text-foreground">
													{result.title}
												</h3>
												<a
													className="opacity-0 transition-opacity group-hover:opacity-100"
													href={result.url}
													onClick={(e) => e.stopPropagation()}
													rel="noopener noreferrer"
													target="_blank"
												>
													<ArrowSquareOut className="size-3.5 text-muted-foreground hover:text-foreground" />
												</a>
											</div>

											<p className="truncate text-muted-foreground text-xs">
												{domain}
											</p>

											<p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
												{result.description}
											</p>
										</div>

										<div className="ml-2">
											{isExpanded ? (
												<CaretUp className="size-4 text-muted-foreground" />
											) : (
												<CaretDown className="size-4 text-muted-foreground" />
											)}
										</div>
									</div>
								</button>

								{showExpandedContent ? (
									<div className="-mt-2 px-4 pb-4">
										<div className="border-t pt-2 pl-8">
											<div className="max-w-none">
												<Markdown>{content}</Markdown>
											</div>
										</div>
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
		);
	},
	(a, b) =>
		a.isLoading === b.isLoading &&
		a.error === b.error &&
		a.results === b.results,
);

"use client";

import { CaretDown, Globe, SpinnerGap } from "@phosphor-icons/react";
import type { SourceUrlUIPart } from "ai";
import { motion } from "motion/react";
import Image from "next/image";
import { memo, useCallback, useMemo, useState } from "react";
import { TRANSITION_LAYOUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Regex constants moved to top level for performance
const WWW_REGEX = /^www\./;
const PROTOCOL_REGEX = /^https?:\/\//;
const TRAILING_SLASH_REGEX = /\/$/;

type UnifiedSearchProps = {
  query: string;
  sources?: SourceUrlUIPart[];
  className?: string;
  isLoading?: boolean;
};

const getFavicon = (url: string) => {
  const domain = new URL(url).hostname;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
};

const formatUrl = (url: string) => {
  try {
    const domain = new URL(url).hostname;
    return domain.replace(WWW_REGEX, "");
  } catch {
    return url
      .replace(PROTOCOL_REGEX, "")
      .replace(TRAILING_SLASH_REGEX, "")
      .replace(WWW_REGEX, "");
  }
};

const addUTM = (url: string) => {
  const u = new URL(url);
  u.searchParams.set("utm_source", "oschat.ai");
  u.searchParams.set("utm_medium", "web-search");
  return u.toString();
};

// Memoized SearchResultItem component to prevent unnecessary rerenders
const SearchResultItem = memo<{
  source: SourceUrlUIPart;
}>(({ source }) => {
  const faviconUrl = useMemo(() => getFavicon(source.url), [source.url]);
  const formattedUrl = useMemo(() => formatUrl(source.url), [source.url]);
  const utmUrl = useMemo(() => addUTM(source.url), [source.url]);

  return (
    <div>
      <a
        className="flex h-[2rem] w-full min-w-0 shrink-0 cursor-pointer flex-row items-center justify-between gap-4 rounded-md px-1 tracking-tight transition-colors hover:bg-accent/50"
        href={utmUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <div className="flex min-w-0 flex-row items-center gap-2">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
            <Image
              alt="favicon"
              className="rounded-sm opacity-100 transition duration-500"
              decoding="async"
              height={16}
              loader={({ src }) => src}
              loading="lazy"
              src={faviconUrl}
              style={{
                maxWidth: "16px",
                maxHeight: "16px",
              }}
              unoptimized
              width={16}
            />
          </div>
          <p className="shrink overflow-hidden text-ellipsis whitespace-nowrap text-foreground text-sm">
            {source.title}
          </p>
          <p className="line-clamp-1 shrink-0 text-muted-foreground text-xs">
            {formattedUrl}
          </p>
        </div>
      </a>
    </div>
  );
});

SearchResultItem.displayName = "SearchResultItem";

export const UnifiedSearch = memo<UnifiedSearchProps>(
  ({ query, sources = [], className, isLoading = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Memoized early returns to prevent unnecessary computations
    const shouldRender = useMemo(() => {
      if (!query) {
        return false;
      }
      if (!isLoading && sources.length === 0) {
        return false;
      }
      return true;
    }, [query, isLoading, sources.length]);

    // Memoized values to prevent recalculation on every render
    const displayText = useMemo(() => {
      return isLoading ? "Searching the web..." : query;
    }, [isLoading, query]);

    const resultText = useMemo(() => {
      return `${sources.length} result${sources.length !== 1 ? "s" : ""}`;
    }, [sources.length]);

    const buttonClassName = useMemo(() => {
      return cn(
        "group/row flex h-[2.625rem] flex-row items-center justify-between gap-4 rounded-xl px-3 py-2 text-muted-foreground transition-colors duration-200",
        isLoading ? "cursor-default" : "cursor-pointer hover:text-foreground"
      );
    }, [isLoading]);

    const caretClassName = useMemo(() => {
      return cn(
        "flex transform items-center justify-center text-muted-foreground transition-transform duration-300 ease-out",
        isExpanded ? "rotate-180" : "rotate-0"
      );
    }, [isExpanded]);

    const resultsClassName = useMemo(() => {
      return "shrink-0 overflow-hidden";
    }, []);

    // Memoized event handlers to prevent child rerenders
    const handleToggleExpanded = useCallback(() => {
      if (!isLoading) {
        setIsExpanded((prev) => !prev);
      }
    }, [isLoading]);

    if (!shouldRender) {
      return null;
    }

    return (
      <div className={cn("my-3 w-full", className)}>
        <div className="flex min-h-[2.625rem] flex-col rounded-xl border bg-card leading-normal tracking-tight shadow-sm transition-all duration-300 ease-out">
          {/* Toggle Button Header */}
          <button
            className={buttonClassName}
            disabled={isLoading}
            onClick={handleToggleExpanded}
            type="button"
          >
            <div className="flex min-w-0 flex-row items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center text-muted-foreground">
                <Globe size={16} />
              </div>
              <div className="flex-grow overflow-hidden overflow-ellipsis whitespace-nowrap text-left text-muted-foreground leading-tight">
                {displayText}
              </div>
            </div>
            <div className="flex min-w-0 shrink-0 flex-row items-center gap-1.5">
              {isLoading ? (
                <div className="animate-spin">
                  <SpinnerGap size={16} weight="bold" />
                </div>
              ) : (
                <>
                  <p className="shrink-0 whitespace-nowrap pl-1 text-muted-foreground text-sm leading-tight">
                    {resultText}
                  </p>
                  <div
                    className={caretClassName}
                    style={{ width: "16px", height: "16px" }}
                  >
                    <CaretDown size={20} />
                  </div>
                </>
              )}
            </div>
          </button>

          {/* Collapsible Results - Only show when not loading and has sources */}
          {!isLoading && sources.length > 0 && (
            <motion.div
              animate={{
                height: isExpanded ? "auto" : 0,
                opacity: isExpanded ? 1 : 0,
              }}
              className={resultsClassName}
              initial={{
                height: isExpanded ? "auto" : 0,
                opacity: isExpanded ? 1 : 0,
              }}
              tabIndex={-1}
              transition={TRANSITION_LAYOUT}
            >
              <div className="bg-gradient-to-b from-transparent via-transparent to-transparent">
                <div
                  className="scrollbar-hide h-full max-h-[238px] overflow-y-auto overflow-x-hidden"
                  tabIndex={-1}
                >
                  <div
                    className="flex flex-col flex-nowrap p-2 pt-0"
                    tabIndex={-1}
                  >
                    {sources.map((source) => (
                      <SearchResultItem key={source.sourceId} source={source} />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  }
);

UnifiedSearch.displayName = "UnifiedSearch";

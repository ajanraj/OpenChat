"use client";

import { CaretDown, Globe, Link } from "@phosphor-icons/react";
import type { SourceUrlUIPart } from "ai";
import { AnimatePresence, motion, type Transition } from "motion/react";
import Image from "next/image";
import { memo, useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// Regex patterns defined at top level for performance
const WWW_PREFIX_REGEX = /^www\./;
const PROTOCOL_REGEX = /^https?:\/\//;
const TRAILING_SLASH_REGEX = /\/$/;

type SourcesListProps = {
  sources: SourceUrlUIPart[];
  className?: string;
};

const getFavicon = (url: string) => {
  const domain = new URL(url).hostname;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
};

const getOpenGraphImage = (url: string) => {
  // Use a service to get OpenGraph images - you can replace this with your preferred service
  return `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url&waitFor=0&type=jpeg&overlay.browser=false&viewport.width=1200&viewport.height=630`;
};

const addUTM = (url: string) => {
  const u = new URL(url);
  u.searchParams.set("utm_source", "oschat.ai");
  u.searchParams.set("utm_medium", "web-search");
  return u.toString();
};

const TRANSITION: Transition = {
  type: "spring",
  duration: 0.2,
  bounce: 0,
};

export const SourcesList = memo<SourcesListProps>(
  ({ sources, className }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

    const formatUrl = useCallback((url: string) => {
      try {
        const domain = new URL(url).hostname;
        return domain.replace(WWW_PREFIX_REGEX, "");
      } catch {
        return url
          .replace(PROTOCOL_REGEX, "")
          .replace(TRAILING_SLASH_REGEX, "")
          .replace(WWW_PREFIX_REGEX, "");
      }
    }, []);

    const handleImageError = useCallback((sourceId: string) => {
      setImageErrors((prev) => new Set([...prev, sourceId]));
    }, []);

    const handleToggleExpanded = useCallback(() => {
      setIsExpanded((prev) => !prev);
    }, []);

    // Memoize favicon generation
    const sourcesWithFavicons = useMemo(
      () =>
        sources.map((source) => ({
          ...source,
          faviconUrl: getFavicon(source.url),
          openGraphUrl: getOpenGraphImage(source.url),
          formattedUrl: formatUrl(source.url),
          utmUrl: addUTM(source.url),
        })),
      [sources, formatUrl]
    );

    // Memoize preview favicons for the collapsed state
    const previewFavicons = useMemo(
      () => sourcesWithFavicons.slice(0, 4),
      [sourcesWithFavicons]
    );

    return (
      <div className={cn("my-4", className)}>
        <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-border bg-card">
          <button
            className="flex w-full flex-row items-center px-4 py-3 transition-colors hover:bg-accent"
            onClick={handleToggleExpanded}
            type="button"
          >
            <div className="flex flex-1 flex-row items-center gap-3 text-left">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">
                Sources ({sources.length})
              </span>
              <div className="-space-x-1 flex">
                {previewFavicons.map((source) => (
                  <Image
                    alt={`Favicon for ${source.title}`}
                    className="h-4 w-4 rounded-full border-2 border-background"
                    height={16}
                    key={source.sourceId}
                    loader={({ src }) => src}
                    src={source.faviconUrl}
                    unoptimized
                    width={16}
                  />
                ))}
                {sources.length > 4 && (
                  <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-muted-foreground text-xs">
                    +{sources.length - 4}
                  </div>
                )}
              </div>
            </div>
            <CaretDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isExpanded ? "rotate-180 transform" : ""
              )}
            />
          </button>

          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                transition={TRANSITION}
              >
                <div className="border-border border-t">
                  <div className="scrollbar-hide overflow-x-auto">
                    <div className="flex min-w-max gap-3 p-4">
                      {sourcesWithFavicons.map((source) => (
                        <motion.div
                          animate={{ opacity: 1, scale: 1 }}
                          className="w-64 flex-shrink-0"
                          initial={{ opacity: 0, scale: 0.95 }}
                          key={source.sourceId}
                          transition={{ duration: 0.2 }}
                        >
                          <a
                            className="group block"
                            href={source.utmUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <div className="overflow-hidden rounded-xl border bg-background transition-colors hover:bg-accent/50">
                              {/* OpenGraph Image */}
                              <div className="relative h-32 w-full overflow-hidden bg-muted">
                                {imageErrors.has(source.sourceId) ? (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <Globe className="h-8 w-8 text-muted-foreground" />
                                  </div>
                                ) : (
                                  <Image
                                    alt={`Preview for ${source.title}`}
                                    blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDMyMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9ImdyYWRpZW50IiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KPHN0b3Agb2Zmc2V0PSIwJSIgc3R5bGU9InN0b3AtY29sb3I6I2Y5ZmFmYjtzdG9wLW9wYWNpdHk6MSIgLz4KPHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjFmNWY5O3N0b3Atb3BhY2l0eToxIiAvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+CjxyZWN0IHdpZHRoPSIzMjAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2dyYWRpZW50KSIvPgo8L3N2Zz4K"
                                    className="scale-110 object-cover transition-transform hover:scale-115"
                                    fill
                                    loading="lazy"
                                    onError={() =>
                                      handleImageError(source.sourceId)
                                    }
                                    placeholder="blur"
                                    src={source.openGraphUrl}
                                    // Remove unoptimized to enable Next.js optimization
                                  />
                                )}
                                {/* Favicon overlay */}
                                <div className="absolute bottom-2 left-2">
                                  <div className="rounded-full bg-background/90 p-1 backdrop-blur-sm">
                                    <Image
                                      alt={`Favicon for ${source.title}`}
                                      className="h-4 w-4 rounded-sm"
                                      height={16}
                                      loader={({ src }) => src}
                                      src={source.faviconUrl}
                                      unoptimized
                                      width={16}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Content */}
                              <div className="flex h-20 flex-col justify-between p-3">
                                <h3 className="line-clamp-2 font-medium text-sm transition-colors group-hover:text-primary">
                                  {source.title}
                                </h3>
                                <div className="mt-1 flex items-center justify-between">
                                  <p className="line-clamp-1 flex-1 text-muted-foreground text-xs">
                                    {source.formattedUrl}
                                  </p>
                                  <div className="ml-2">
                                    <Link className="h-3 w-3 text-muted-foreground" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </a>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Scroll hint */}
                  {sources.length > 1 && (
                    <div className="px-4 pb-2">
                      <div className="text-center text-muted-foreground text-xs">
                        Scroll horizontally to view more sources →
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison to avoid deep comparison on sources array
    if (prevProps.className !== nextProps.className) {
      return false;
    }
    if (prevProps.sources.length !== nextProps.sources.length) {
      return false;
    }

    return prevProps.sources.every((source, index) => {
      const nextSource = nextProps.sources[index];
      return (
        source.sourceId === nextSource?.sourceId &&
        source.url === nextSource?.url &&
        source.title === nextSource?.title
      );
    });
  }
);

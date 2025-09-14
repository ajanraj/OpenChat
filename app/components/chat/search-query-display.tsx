"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SearchQuery = {
  query: string;
  toolName?: string;
};

type SearchQueryDisplayProps = {
  queries: SearchQuery[];
  className?: string;
};

export const SearchQueryDisplay = memo<SearchQueryDisplayProps>(
  ({ queries, className }) => {
    const queryBadges = useMemo(() => {
      if (!queries || queries.length === 0) {
        return null;
      }

      return queries.map((searchQuery, index) => (
        <Badge
          className="flex max-w-full items-center gap-1.5 border-border/50 bg-muted/30 px-2.5 py-1 text-foreground text-sm transition-colors hover:bg-muted/50"
          key={`${searchQuery.toolName || "search"}-${searchQuery.query}-${index}`}
          variant="outline"
        >
          <MagnifyingGlassIcon className="size-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="min-w-0 overflow-hidden hyphens-auto break-words font-mono font-thin text-xs">
            {searchQuery.query}
          </span>
        </Badge>
      ));
    }, [queries]);

    if (!queries || queries.length === 0) {
      return null;
    }

    return (
      <div className={cn("mb-3 flex flex-wrap items-center gap-2", className)}>
        <span className="font-medium text-muted-foreground text-sm">
          Searching
        </span>
        {queryBadges}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison to avoid deep comparison on queries array
    if (prevProps.className !== nextProps.className) {
      return false;
    }
    if (prevProps.queries.length !== nextProps.queries.length) {
      return false;
    }

    return prevProps.queries.every((query, index) => {
      const nextQuery = nextProps.queries[index];
      return (
        query.query === nextQuery?.query &&
        query.toolName === nextQuery?.toolName
      );
    });
  }
);

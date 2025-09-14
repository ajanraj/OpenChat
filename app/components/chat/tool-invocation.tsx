"use client";

import { CaretDown, Code, Link, Nut, Spinner } from "@phosphor-icons/react";
// Note: AI SDK v5 uses ToolUIPart instead of ToolInvocationUIPart
// We'll use custom types that work with the existing component structure
import { AnimatePresence, motion, type Transition } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SearchQueryDisplay } from "./search-query-display";
import { SearchResults } from "./search-result";

type CustomToolInvocation = {
  state: "requested" | "result";
  step?: number;
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
};

type CustomToolInvocationUIPart = {
  type: "tool-invocation";
  toolInvocation: CustomToolInvocation;
};

type ToolInvocationProps = {
  data: CustomToolInvocationUIPart | CustomToolInvocationUIPart[];
  className?: string;
  defaultOpen?: boolean;
};

// Types for parsed results
type SearchResult = {
  url: string;
  title: string;
  snippet?: string;
};

type ObjectResult = {
  title?: string;
  html_url?: string;
  [key: string]: unknown;
};

type ParsedResult = SearchResult[] | ObjectResult | string | unknown;

function hasResult(
  toolInvocation: CustomToolInvocation
): toolInvocation is CustomToolInvocation & { result: unknown } {
  return (
    toolInvocation.state === "result" ||
    ("result" in toolInvocation && toolInvocation.result !== undefined)
  );
}

const TRANSITION: Transition = {
  type: "spring",
  duration: 0.2,
  bounce: 0,
};

// Helper to format argument values for display without deep nested ternaries
function formatArgValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : JSON.stringify(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

// Helper to safely extract text content from AI SDK result objects
function extractTextFromResultObject(obj: unknown): string | null {
  if (
    typeof obj === "object" &&
    obj !== null &&
    "content" in obj &&
    Array.isArray((obj as { content: unknown }).content)
  ) {
    const contentArr = (
      obj as { content: Array<{ type: string; text?: string }> }
    ).content;
    const textPart = contentArr.find((item) => item.type === "text");
    return textPart?.text ?? null;
  }
  return null;
}

// Parse result data coming back from the tool invocation.
function parseResultData(result: unknown): {
  parsed: ParsedResult | null;
  error: string | null;
} {
  if (!result) {
    return { parsed: null, error: null };
  }

  // If the result is already an array (e.g., search results)
  if (Array.isArray(result)) {
    return { parsed: result as ParsedResult, error: null };
  }

  // Attempt to pull out a text field from a structured response
  const possibleText = extractTextFromResultObject(result);
  if (possibleText) {
    try {
      // Try to interpret it as JSON first
      return { parsed: JSON.parse(possibleText) as ParsedResult, error: null };
    } catch {
      // Fallback to raw text
      return { parsed: possibleText, error: null };
    }
  }

  // Fallback – return raw object stringified for display
  return { parsed: JSON.stringify(result), error: null };
}

// Helper function to extract search queries from tool arguments
function extractSearchQueries(
  toolInvocations: CustomToolInvocationUIPart[]
): Array<{ query: string; toolName: string }> {
  return toolInvocations
    .map((item) => {
      const { toolInvocation } = item;
      const { toolName, args } = toolInvocation as CustomToolInvocation;

      // Handle different search tool argument structures
      if (toolName === "search" && args) {
        // New unified search tool
        return { query: args.query as string, toolName };
      }

      if (toolName === "duckDuckGo" && args) {
        // Legacy duckDuckGo tool
        return { query: args.query as string, toolName };
      }

      if (toolName === "exaSearch" && args) {
        // Legacy exaSearch tool
        return { query: args.query as string, toolName };
      }

      return null;
    })
    .filter(
      (item): item is { query: string; toolName: string } =>
        item !== null &&
        typeof item.query === "string" &&
        item.query.trim().length > 0
    );
}

// Helper renderers split to keep individual functions simple
function renderSearchToolResults(parsedResult: ParsedResult | null): ReactNode {
  if (
    typeof parsedResult === "object" &&
    parsedResult !== null &&
    !Array.isArray(parsedResult)
  ) {
    const searchData = parsedResult as {
      success?: boolean;
      results?: Array<{ url?: string; title?: string; description?: string }>;
      error?: string;
    };
    if (searchData.success && searchData.results) {
      return (
        <SearchResults
          results={
            searchData.results as Array<{
              url: string;
              title: string;
              description: string;
            }>
          }
        />
      );
    }
    if (searchData.error) {
      return <SearchResults error={searchData.error} results={[]} />;
    }
  }
  return null;
}

function renderArrayResults(parsedResult: ParsedResult): ReactNode {
  if (!Array.isArray(parsedResult) || parsedResult.length === 0) {
    return null;
  }

  const firstItem = parsedResult[0];
  if (
    typeof firstItem === "object" &&
    firstItem !== null &&
    "url" in firstItem &&
    "title" in firstItem
  ) {
    return (
      <div className="space-y-3">
        {(parsedResult as SearchResult[]).map((item) => (
          <div
            className="border-gray-100 border-b pb-3 last:border-0 last:pb-0"
            key={item.url}
          >
            <a
              className="group flex items-center gap-1 font-medium text-primary hover:underline"
              href={item.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {item.title}
              <Link className="h-3 w-3 opacity-70 transition-opacity group-hover:opacity-100" />
            </a>
            <div className="mt-1 font-mono text-muted-foreground text-xs">
              {item.url}
            </div>
            {item.snippet && (
              <div className="mt-1 line-clamp-2 text-sm">{item.snippet}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <pre className="whitespace-pre-wrap font-mono text-xs">
      {JSON.stringify(parsedResult, null, 2)}
    </pre>
  );
}

function renderObjectResults(parsedResult: ParsedResult): ReactNode {
  if (
    typeof parsedResult !== "object" ||
    parsedResult === null ||
    Array.isArray(parsedResult)
  ) {
    return null;
  }
  const obj = parsedResult as ObjectResult;
  return (
    <div>
      {obj.title && <div className="mb-2 font-medium">{obj.title}</div>}
      {obj.html_url && (
        <div className="mb-2">
          <a
            className="flex items-center gap-1 text-primary hover:underline"
            href={obj.html_url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span className="font-mono">{obj.html_url}</span>
            <Link className="h-3 w-3 opacity-70" />
          </a>
        </div>
      )}
      <pre className="whitespace-pre-wrap font-mono text-xs">
        {JSON.stringify(obj, null, 2)}
      </pre>
    </div>
  );
}

// Render parsed results orchestrator
function renderParsedResults(
  toolName: string,
  parsedResult: ParsedResult | null
): ReactNode {
  if (!parsedResult) {
    return "No result data available";
  }

  if (toolName === "search") {
    const searchRendered = renderSearchToolResults(parsedResult);
    if (searchRendered) {
      return searchRendered;
    }
  }

  if (Array.isArray(parsedResult)) {
    return renderArrayResults(parsedResult);
  }

  if (typeof parsedResult === "object" && parsedResult !== null) {
    return renderObjectResults(parsedResult);
  }

  if (typeof parsedResult === "string") {
    return <div className="whitespace-pre-wrap">{parsedResult}</div>;
  }

  return "No result data available";
}

export function ToolInvocation({
  data,
  defaultOpen = false,
}: ToolInvocationProps) {
  const [isExpanded, setIsExpanded] = useState(defaultOpen);

  const toolInvocations = Array.isArray(data) ? data : [data];

  const uniqueToolIds = new Set(
    toolInvocations.map((item) => item.toolInvocation.toolCallId)
  );
  const isSingleTool = uniqueToolIds.size === 1;

  if (isSingleTool) {
    return (
      <SingleToolView
        className="mb-10"
        data={toolInvocations}
        defaultOpen={defaultOpen}
      />
    );
  }

  // Extract search queries for multi-tool view
  const allSearchQueries = extractSearchQueries(toolInvocations);

  return (
    <div className="mb-10">
      {/* Search queries display for multi-tool view */}
      {allSearchQueries.length > 0 && (
        <div className="mb-3">
          <SearchQueryDisplay queries={allSearchQueries} />
        </div>
      )}
      <div className="flex flex-col gap-0 overflow-hidden rounded-md border border-border">
        <button
          className="flex w-full flex-row items-center rounded-t-md px-3 py-2 transition-colors hover:bg-accent"
          onClick={() => setIsExpanded(!isExpanded)}
          type="button"
        >
          <div className="flex flex-1 flex-row items-center gap-2 text-left text-base">
            <Nut className="size-4 text-muted-foreground" />
            <span className="text-sm">Tools executed</span>
            <div className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-slate-700 text-xs">
              {uniqueToolIds.size}
            </div>
          </div>
          <CaretDown
            className={cn(
              "h-4 w-4 transition-transform",
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
              <div className="px-3 pt-3 pb-3">
                <div className="space-y-4">
                  {/* Group tools by toolCallId */}
                  {Array.from(uniqueToolIds).map((toolId) => {
                    const requestTool = toolInvocations.find(
                      (item) =>
                        item.toolInvocation.toolCallId === toolId &&
                        (item.toolInvocation as CustomToolInvocation).state ===
                          "requested"
                    );

                    const resultTool = toolInvocations.find(
                      (item) =>
                        item.toolInvocation.toolCallId === toolId &&
                        item.toolInvocation.state === "result"
                    );

                    // Show the result tool if available, otherwise show the request
                    const toolToShow = resultTool || requestTool;

                    if (!toolToShow) {
                      return null;
                    }

                    return (
                      <div
                        className="border-gray-100 border-b pb-4 last:border-0 last:pb-0"
                        key={toolId}
                      >
                        <SingleToolView data={[toolToShow]} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SingleToolView({
  data,
  defaultOpen = false,
  className,
}: {
  data: CustomToolInvocationUIPart[];
  defaultOpen?: boolean;
  className?: string;
}) {
  // Move all hooks to the top before any early returns
  const [isExpanded, setIsExpanded] = useState(defaultOpen);
  const [parsedResult, setParsedResult] = useState<ParsedResult>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const resultTool = data.find(
    (item) => item.toolInvocation.state === "result"
  );
  const requestTool = data.find(
    (item) =>
      (item.toolInvocation as CustomToolInvocation).state === "requested"
  );
  const toolData = resultTool || requestTool;

  const { toolInvocation } = toolData || { toolInvocation: null };
  const { state, toolName, toolCallId, args } = toolInvocation
    ? (toolInvocation as CustomToolInvocation)
    : { state: null, toolName: "", toolCallId: "", args: null };

  const isRequested = state === "requested";
  const isCompleted = state === "result";
  const result =
    toolInvocation && hasResult(toolInvocation)
      ? toolInvocation.result
      : undefined;

  // Parse the result JSON if available (delegated to helper to reduce complexity)
  useEffect(() => {
    if (isCompleted && result) {
      const { parsed, error } = parseResultData(result);
      setParsedResult(parsed);
      setParseError(error);
    }
  }, [isCompleted, result]);

  // Early return after hooks
  if (!toolData) {
    return null;
  }

  const formattedArgs = args
    ? Object.entries(args).map(([key, value]) => (
        <div className="mb-1" key={key}>
          <span className="font-medium text-slate-600">{key}:</span>{" "}
          <span className="font-mono">{formatArgValue(value)}</span>
        </div>
      ))
    : null;

  const renderedResults = renderParsedResults(toolName, parsedResult);

  // Extract search queries for display
  const searchQueries = extractSearchQueries(data);
  const isSearchTool = ["search", "duckDuckGo", "exaSearch"].includes(toolName);

  return (
    <div
      className={cn(
        "flex flex-col gap-0 overflow-hidden rounded-md border border-border",
        className
      )}
    >
      {/* Search queries display - shown above the tool when it's a search tool */}
      {isSearchTool && searchQueries.length > 0 && (
        <div className="px-3 pt-3 pb-0">
          <SearchQueryDisplay queries={searchQueries} />
        </div>
      )}
      <button
        className="flex w-full flex-row items-center rounded-t-md px-3 py-2 transition-colors hover:bg-accent"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <div className="flex flex-1 flex-row items-center gap-2 text-left text-base">
          <span className="font-mono text-sm">{toolName}</span>
          <div
            className={cn(
              "rounded-full px-1.5 py-0.5 text-xs",
              isRequested
                ? "border border-blue-200 bg-blue-50 text-blue-700"
                : "border border-green-200 bg-green-50 text-green-700"
            )}
          >
            {isRequested ? (
              <div className="flex items-center">
                <Spinner className="mr-1 h-3 w-3 animate-spin" />
                Running
              </div>
            ) : (
              "Completed"
            )}
          </div>
        </div>
        <CaretDown
          className={cn(
            "h-4 w-4 transition-transform",
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
            <div className="space-y-3 px-3 pt-3 pb-3">
              {/* Arguments section */}
              {args && Object.keys(args).length > 0 && (
                <div>
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    Arguments
                  </div>
                  <div className="rounded border bg-slate-50 p-2 text-sm">
                    {formattedArgs}
                  </div>
                </div>
              )}

              {/* Result section */}
              {isCompleted && (
                <div>
                  <div className="mb-1 font-medium text-muted-foreground text-xs">
                    Result
                  </div>
                  <div className="max-h-60 overflow-auto rounded border bg-slate-50 p-2 text-sm">
                    {parseError ? (
                      <div className="text-red-500">{parseError}</div>
                    ) : (
                      renderedResults
                    )}
                  </div>
                </div>
              )}

              {/* Tool call ID */}
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <div className="flex items-center">
                  <Code className="mr-1 inline h-3 w-3" />
                  Tool Call ID:{" "}
                  <span className="ml-1 font-mono">{toolCallId}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

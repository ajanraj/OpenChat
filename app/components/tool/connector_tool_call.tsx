"use client";

import { CaretDown, Copy, SpinnerGap } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectorIcon } from "@/app/components/common/connector-icon";
import { getConnectorConfig } from "@/lib/config/tools";
import { TRANSITION_LAYOUT } from "@/lib/motion";
import type { ConnectorType } from "@/lib/types";
import { cn } from "@/lib/utils";

// Types for connector tool calls
type ConnectorToolCallData = {
  toolName: string;
  connectorType: ConnectorType;
  request?: {
    action: string;
    parameters?: Record<string, unknown>;
  };
  response?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  metadata?: {
    executionTime?: number;
    timestamp?: string;
  };
};

type ConnectorToolCallProps = {
  data: ConnectorToolCallData;
  className?: string;
  isLoading?: boolean;
};

// Copy to clipboard functionality
const CopyButton = memo<{ content: string; size?: number }>(
  ({ content, size = 12 }) => {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<number | null>(null);

    const handleCopy = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(content);
        setCopied(true);

        // Clear any existing timeout
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
        }

        // Set new timeout and store reference
        timeoutRef.current = window.setTimeout(() => {
          setCopied(false);
          timeoutRef.current = null;
        }, 2000);
      } catch (_error) {
        // Silently handle clipboard error
      }
    }, [content]);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    // Get Tailwind size classes based on size prop
    const getSizeClasses = (sizeValue: number): string => {
      const sizeMap: Record<number, string> = {
        12: "h-3 w-3",
        16: "h-4 w-4",
        20: "h-5 w-5",
        24: "h-6 w-6",
      };
      return sizeMap[sizeValue] || "h-3 w-3"; // fallback to h-3 w-3 for size 12
    };

    const sizeClasses = getSizeClasses(size);

    return (
      <button
        aria-label="Copy to clipboard"
        className={cn(
          "relative inline-flex shrink-0 select-none items-center justify-center",
          "disabled:pointer-events-none disabled:opacity-50",
          "border-transparent font-ui text-muted-foreground tracking-tight transition",
          "duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)]",
          "hover:bg-accent hover:text-foreground",
          "h-6 w-6 rounded-md active:scale-95"
        )}
        onClick={handleCopy}
        type="button"
      >
        <div className="relative flex">
          <div
            className={cn(
              "flex items-center justify-center text-muted-foreground transition-all",
              copied ? "scale-50 opacity-0" : "scale-100 opacity-100",
              sizeClasses
            )}
          >
            <Copy size={size} />
          </div>
          <div
            className={cn(
              "absolute top-0 left-0 flex items-center justify-center text-muted-foreground transition-all",
              copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
              sizeClasses
            )}
          >
            <svg
              aria-hidden="true"
              className="shrink-0"
              fill="currentColor"
              height={size}
              viewBox="0 0 20 20"
              width={size}
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M15.1883 5.10908C15.3699 4.96398 15.6346 4.96153 15.8202 5.11592C16.0056 5.27067 16.0504 5.53125 15.9403 5.73605L15.8836 5.82003L8.38354 14.8202C8.29361 14.9279 8.16242 14.9925 8.02221 14.9989C7.88203 15.0051 7.74545 14.9526 7.64622 14.8534L4.14617 11.3533L4.08172 11.2752C3.95384 11.0811 3.97542 10.817 4.14617 10.6463C4.31693 10.4755 4.58105 10.4539 4.77509 10.5818L4.85321 10.6463L7.96556 13.7586L15.1161 5.1794L15.1883 5.10908Z" />
            </svg>
          </div>
        </div>
      </button>
    );
  }
);

CopyButton.displayName = "CopyButton";

// Format JSON for display with syntax highlighting
const formatJsonContent = (data: unknown): string => {
  if (typeof data === "string") {
    return data;
  }
  return JSON.stringify(data, null, 2);
};

// Main component
export const ConnectorToolCall = memo<ConnectorToolCallProps>(
  ({ data, className, isLoading = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Memoized values
    const connectorConfig = useMemo(
      () => getConnectorConfig(data.connectorType),
      [data.connectorType]
    );

    const displayText = useMemo(() => {
      if (isLoading) {
        return `Executing ${data.toolName}...`;
      }
      return data.request?.action || data.toolName;
    }, [isLoading, data.toolName, data.request?.action]);

    const statusText = useMemo(() => {
      if (isLoading) {
        return "Running";
      }
      if (data.response?.error) {
        return "Failed";
      }
      if (data.response?.success) {
        return "Success";
      }
      return "Completed";
    }, [isLoading, data.response]);

    const buttonClassName = useMemo(() => {
      return cn(
        "group/row flex h-[2.625rem] flex-row items-center justify-between gap-4 rounded-xl px-3 py-2",
        "text-muted-foreground transition-colors duration-200",
        isLoading ? "cursor-default" : "cursor-pointer hover:text-foreground"
      );
    }, [isLoading]);

    const caretClassName = useMemo(() => {
      return "flex items-center justify-center text-muted-foreground";
    }, []);

    const resultsClassName = useMemo(() => {
      return "shrink-0 overflow-hidden";
    }, []);

    const handleToggleExpanded = useCallback(() => {
      if (!isLoading) {
        setIsExpanded((prev) => !prev);
      }
    }, [isLoading]);

    const requestContent = useMemo(() => {
      return formatJsonContent(data.request);
    }, [data.request]);

    const responseContent = useMemo(() => {
      return formatJsonContent(data.response);
    }, [data.response]);

    return (
      <div className={cn("my-3 w-full", className)}>
        <div className="flex min-h-[2.625rem] flex-col rounded-xl border bg-card font-ui leading-normal tracking-tight shadow-sm transition-all duration-400 ease-out">
          {/* Toggle Button Header */}
          <button
            className={buttonClassName}
            disabled={isLoading}
            onClick={handleToggleExpanded}
            type="button"
          >
            <div className="flex min-w-0 flex-row items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center text-muted-foreground">
                <ConnectorIcon
                  className="h-[18px] w-[18px]"
                  connector={connectorConfig}
                />
              </div>
              <div className="relative bottom-[0.5px] flex-grow overflow-hidden overflow-ellipsis whitespace-nowrap text-left text-muted-foreground leading-tight">
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
                  <div className="shrink-0 whitespace-nowrap text-muted-foreground text-sm leading-tight">
                    {connectorConfig.displayName}
                  </div>
                  <motion.div
                    animate={{
                      rotate: isExpanded ? -180 : 0,
                    }}
                    className={cn(caretClassName, "h-4 w-4")}
                    initial={{
                      rotate: isExpanded ? -180 : 0,
                    }}
                    transition={TRANSITION_LAYOUT}
                  >
                    <CaretDown size={20} />
                  </motion.div>
                </>
              )}
            </div>
          </button>

          {/* Collapsible Results */}
          {!isLoading && (
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
              <div>
                <div
                  className="h-full max-h-[238px] overflow-y-auto overflow-x-hidden"
                  style={{ scrollbarGutter: "stable" }}
                  tabIndex={-1}
                >
                  <div className="flex flex-col gap-3 p-3 pt-1">
                    {/* Request Section */}
                    {data.request && (
                      <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
                        <div className="flex h-3 items-center justify-between">
                          <p className="font-medium font-ui text-[0.6875rem] text-muted-foreground tracking-tight">
                            Request
                          </p>
                          <CopyButton content={requestContent} />
                        </div>
                        <div className="max-h-32 overflow-auto font-mono text-sm leading-relaxed">
                          <pre className="whitespace-pre-wrap">
                            {requestContent}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Response Section */}
                    {data.response && (
                      <div className="flex flex-col gap-3 rounded-md bg-muted p-3">
                        <div className="flex h-3 items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="font-medium font-ui text-[0.6875rem] text-muted-foreground tracking-tight">
                              Response
                            </p>
                            <div
                              className={cn(
                                "rounded px-1.5 py-0.5 font-medium text-[0.6875rem]",
                                (() => {
                                  if (data.response.error) {
                                    return "bg-destructive/10 text-destructive";
                                  }
                                  if (data.response.success) {
                                    return "bg-green-100 text-green-700";
                                  }
                                  return "bg-secondary text-secondary-foreground";
                                })()
                              )}
                            >
                              {statusText}
                            </div>
                          </div>
                          <CopyButton content={responseContent} />
                        </div>
                        <div className="max-h-32 overflow-auto font-mono text-sm leading-relaxed">
                          <pre className="whitespace-pre-wrap">
                            {responseContent}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Metadata Section */}
                    {data.metadata && (
                      <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
                        <p className="font-medium font-ui text-[0.6875rem] text-muted-foreground tracking-tight">
                          Metadata
                        </p>
                        <div className="space-y-1 text-muted-foreground text-xs">
                          {data.metadata.executionTime && (
                            <div className="flex justify-between">
                              <span>Execution Time:</span>
                              <span className="font-mono">
                                {data.metadata.executionTime}ms
                              </span>
                            </div>
                          )}
                          {data.metadata.timestamp && (
                            <div className="flex justify-between">
                              <span>Timestamp:</span>
                              <span className="font-mono">
                                {data.metadata.timestamp}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Connector:</span>
                            <span className="font-mono">
                              {data.connectorType}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Tool:</span>
                            <span className="font-mono">{data.toolName}</span>
                          </div>
                        </div>
                      </div>
                    )}
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

ConnectorToolCall.displayName = "ConnectorToolCall";

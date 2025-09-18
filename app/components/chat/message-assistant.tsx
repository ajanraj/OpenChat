"use client";

import type { UIMessage as MessageType } from "@ai-sdk/react";
import type {
  FileUIPart,
  ReasoningUIPart,
  SourceUrlUIPart,
  ToolUIPart,
} from "ai";
import type { Infer } from "convex/values";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Loader } from "@/components/prompt-kit/loader";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
} from "@/components/prompt-kit/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/prompt-kit/reasoning";
import type { Message as MessageSchema } from "@/convex/schema/message";
import { cn } from "@/lib/utils";

// Error part type for rendering
type ErrorUIPart = {
  type: "error";
  error: {
    code: string;
    message: string;
    rawError?: string; // Technical error for backend (not displayed)
  };
};

// Agent data part types for custom streaming
type AgentStartDataPart = {
  type: "data-agent-start";
  id: string;
  data: {
    task: string;
    tool: string[];
    agentId: string;
  };
};

type AgentStepDataPart = {
  type: "data-agent-step";
  id: string;
  data: {
    type: "text" | "tool" | "reasoning" | "step";
    status: "start" | "end" | "input-available" | "output-available" | "finish";
    stepId: string;
    // Optional fields based on step type
    contentId?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  };
};

type AgentStepUpdateDataPart = {
  type: "data-agent-step-update";
  id: string;
  data: {
    type: "text" | "reasoning" | "tool";
    delta: string;
    contentId?: string;
    toolCallId?: string;
    stepId: string;
  };
};

type AgentEndDataPart = {
  type: "data-agent-end";
  id: string;
  data: {
    result: string;
    agentId: string;
  };
};

type AgentErrorDataPart = {
  type: "data-agent-error";
  id: string;
  data: {
    error: string;
    agentId: string;
  };
};

// Union type for all agent data parts
type AgentDataPart =
  | AgentStartDataPart
  | AgentStepDataPart
  | AgentStepUpdateDataPart
  | AgentEndDataPart
  | AgentErrorDataPart;

// Type guard for error parts
const isErrorPart = (part: unknown): part is ErrorUIPart => {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "error" &&
    "error" in part &&
    typeof part.error === "object" &&
    part.error !== null &&
    "code" in part.error &&
    typeof part.error.code === "string" &&
    "message" in part.error &&
    typeof part.error.message === "string"
  );
};

// Type guards for agent data parts
const isAgentDataPart = (part: unknown): part is AgentDataPart => {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    typeof part.type === "string" &&
    part.type.startsWith("data-agent-")
  );
};

const isAgentStartPart = (part: unknown): part is AgentStartDataPart => {
  return isAgentDataPart(part) && part.type === "data-agent-start";
};

const isAgentStepPart = (part: unknown): part is AgentStepDataPart => {
  return isAgentDataPart(part) && part.type === "data-agent-step";
};

const isAgentStepUpdatePart = (
  part: unknown
): part is AgentStepUpdateDataPart => {
  return isAgentDataPart(part) && part.type === "data-agent-step-update";
};

const isAgentEndPart = (part: unknown): part is AgentEndDataPart => {
  return isAgentDataPart(part) && part.type === "data-agent-end";
};

const isAgentErrorPart = (part: unknown): part is AgentErrorDataPart => {
  return isAgentDataPart(part) && part.type === "data-agent-error";
};

import {
  ArrowClockwise,
  Check,
  Copy,
  FilePdf,
  GitBranch,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic"; // Client component – required when using React hooks in the app router
import Image from "next/image";

import { memo, useEffect, useMemo, useRef, useState } from "react"; // Import React to access memo
import { ConnectorToolCall } from "@/app/components/tool/connector_tool_call";
import { UnifiedSearch } from "@/app/components/tool/web_search";
import {
  MorphingDialog,
  MorphingDialogClose,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogImage,
  MorphingDialogTrigger,
} from "@/components/motion-primitives/morphing-dialog";
import {
  getConnectorTypeFromToolName,
  isConnectorTool,
} from "@/lib/config/tools";
import type { ConnectorType } from "@/lib/types";
import { SourcesList } from "./sources-list";

// Helper function to format model display with reasoning effort
const formatModelDisplayText = (modelName: string, effort?: string) => {
  if (!effort || effort === "none") {
    return modelName;
  }
  return `${modelName} (${effort})`;
};

// Helper function to extract sources from parts
const extractSourcesFromParts = (
  combinedParts: MessageType["parts"]
): SourceUrlUIPart[] => {
  if (!combinedParts) {
    return [];
  }

  // Process both 'source-url' and 'tool-search' parts
  return combinedParts.flatMap((part): SourceUrlUIPart[] => {
    // Handle standard source URLs
    if (part.type === "source-url") {
      return [part];
    }

    // Handle search results from the search tool
    if (
      part.type === "tool-search" &&
      "state" in part &&
      part.state === "output-available" &&
      "output" in part &&
      part.output &&
      typeof part.output === "object" &&
      "results" in part.output &&
      Array.isArray((part.output as { results: unknown }).results)
    ) {
      // Type assertion for safety
      const toolPart = part as ToolUIPart & {
        output: { results: Array<{ url: string; title: string }> };
      };

      // console.log('Tool search results:', toolPart.output.results[0].title);

      return toolPart.output.results.map((result) => ({
        sourceId: result.url, // Use URL as sourceId
        type: "source-url",
        url: result.url,
        title: result.title, // Use title for display
      }));
    }

    // Return empty for other part types
    return [];
  });
};

// Helper function to extract search query from parts
const extractSearchQueryFromParts = (
  combinedParts: MessageType["parts"]
): string | null => {
  if (!combinedParts) {
    return null;
  }

  for (const part of combinedParts) {
    if (
      part.type === "tool-search" &&
      "input" in part &&
      part.input &&
      typeof part.input === "object" &&
      "query" in part.input
    ) {
      return part.input.query as string;
    }
  }

  return null;
};

// Helper function to render different file types
const renderFilePart = (filePart: FileUIPart, index: number) => {
  const displayUrl = filePart.url;
  const filename = filePart.filename || `file-${index}`;
  const mediaType = filePart.mediaType || "application/octet-stream";

  if (mediaType.startsWith("image")) {
    // If image was redacted on the server, render a fixed-size placeholder with overlay text
    if (displayUrl === "redacted") {
      return (
        <div className="mb-1" key={`file-${index}`}>
          <div
            aria-label="Image redacted"
            className="relative overflow-hidden rounded-md bg-muted"
            role="img"
            style={{ width: 300, height: 300 }}
          >
            {/* Subtle pattern background */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 10px, transparent 10px, transparent 20px)",
              }}
            />
            {/* Centered label */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full border border-border bg-background/80 px-3 py-1 text-muted-foreground text-xs">
                Image redacted
              </span>
            </div>
          </div>
        </div>
      );
    }
    return (
      <MorphingDialog
        key={`file-${index}`}
        transition={{
          type: "spring",
          stiffness: 280,
          damping: 18,
          mass: 0.3,
        }}
      >
        <MorphingDialogTrigger className="z-10">
          <Image
            alt={filename}
            className="mb-1 rounded-md"
            height={300}
            src={displayUrl}
            width={300}
          />
        </MorphingDialogTrigger>
        <MorphingDialogContainer>
          <MorphingDialogContent className="relative rounded-lg">
            <MorphingDialogImage
              alt={filename}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              src={displayUrl}
            />
          </MorphingDialogContent>
          <MorphingDialogClose className="text-primary" />
        </MorphingDialogContainer>
      </MorphingDialog>
    );
  }

  if (mediaType.startsWith("text")) {
    if (displayUrl === "redacted") {
      return (
        <div className="mb-2 w-[300px] rounded-md border bg-muted p-3 text-center text-muted-foreground text-xs">
          Attachment redacted
        </div>
      );
    }
    return (
      <a
        aria-label={`Download text file: ${filename}`}
        className="mb-2 flex w-35 cursor-pointer flex-col justify-between rounded-lg border border-gray-200 bg-muted px-4 py-2 shadow-sm transition-colors hover:bg-muted/80 focus:bg-muted/70 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:focus:bg-zinc-800 dark:hover:bg-zinc-700"
        download={filename}
        href={displayUrl}
        key={`file-${index}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            (e.currentTarget as HTMLAnchorElement).click();
          }
        }}
        rel="noopener noreferrer"
        style={{ minWidth: 0, minHeight: 64 }}
        tabIndex={0}
        target="_blank"
      >
        <div className="flex items-center gap-2">
          <span
            className="overflow-hidden truncate whitespace-nowrap font-medium text-gray-900 text-sm dark:text-gray-100"
            style={{ maxWidth: "calc(100% - 28px)" }}
            title={filename}
          >
            {filename}
          </span>
        </div>
      </a>
    );
  }

  if (mediaType === "application/pdf") {
    if (displayUrl === "redacted") {
      return (
        <div className="mb-2 w-[120px] rounded-md border bg-muted px-4 py-2 text-center text-muted-foreground text-xs">
          Attachment redacted
        </div>
      );
    }
    return (
      <a
        aria-label={`Download PDF: ${filename}`}
        className="mb-2 flex w-35 cursor-pointer flex-col justify-between rounded-lg border border-gray-200 bg-muted px-4 py-2 shadow-sm transition-colors hover:bg-muted/80 focus:bg-muted/70 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:focus:bg-zinc-800 dark:hover:bg-zinc-700"
        download={filename}
        href={displayUrl}
        key={`file-${index}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            (e.currentTarget as HTMLAnchorElement).click();
          }
        }}
        rel="noopener noreferrer"
        style={{ minWidth: 0, minHeight: 64 }}
        tabIndex={0}
        target="_blank"
      >
        {/* Placeholder preview lines */}
        <div
          aria-hidden="true"
          className="mt-1 mb-2 flex flex-1 flex-col gap-0.5"
        >
          <div className="h-2 w-4/5 rounded bg-gray-200 dark:bg-zinc-600" />
          <div className="h-2 w-3/5 rounded bg-gray-200 dark:bg-zinc-600" />
          <div className="h-2 w-2/5 rounded bg-gray-200 dark:bg-zinc-600" />
        </div>
        {/* Footer with icon and filename */}
        <div className="flex items-center gap-2">
          <FilePdf
            aria-hidden="true"
            className="shrink-0 text-gray-500 dark:text-gray-300"
            size={20}
            weight="duotone"
          />
          <span
            className="overflow-hidden truncate whitespace-nowrap font-medium text-gray-900 text-sm dark:text-gray-100"
            style={{ maxWidth: "calc(100% - 28px)" }}
            title={filename}
          >
            {filename}
          </span>
        </div>
      </a>
    );
  }

  return null;
};

type MessageAssistantProps = {
  isLast?: boolean;
  hasScrollAnchor?: boolean;
  copied?: boolean;
  copyToClipboard?: () => void;
  onReload?: () => void;
  onBranch?: () => void;
  model?: string;
  parts?: MessageType["parts"];
  status?: "streaming" | "ready" | "submitted" | "error";
  id: string;
  metadata?: Infer<typeof MessageSchema>["metadata"];
  readOnly?: boolean;
};

const Markdown = dynamic(
  () => import("@/components/prompt-kit/markdown").then((mod) => mod.Markdown),
  { ssr: false }
);

// Individual part renderers for sequential rendering
const renderTextPart = (
  part: { type: "text"; text: string },
  index: number,
  id: string
) => {
  if (!part.text.trim()) {
    return null;
  }

  return (
    <MessageContent
      className="prose dark:prose-invert relative min-w-full bg-transparent p-0"
      id={`${id}-text-${index}`}
      key={`text-${index}`}
      markdown={true}
    >
      {part.text}
    </MessageContent>
  );
};

const renderReasoningPart = (
  part: ReasoningUIPart,
  index: number,
  id: string,
  showReasoning: boolean,
  toggleReasoning: () => void,
  isPartStreaming: boolean
) => {
  return (
    <div className="mb-2 w-full" key={`reasoning-${index}`}>
      <Reasoning
        expanded={showReasoning}
        isLoading={isPartStreaming}
        onToggle={toggleReasoning}
      >
        <ReasoningTrigger />
        <ReasoningContent>
          <Markdown
            className="prose prose-sm dark:prose-invert w-full max-w-none break-words leading-relaxed"
            id={`${id}-reasoning-${index}`}
          >
            {part.text}
          </Markdown>
        </ReasoningContent>
      </Reasoning>
    </div>
  );
};

const renderToolPart = (part: ToolUIPart, index: number, _id: string) => {
  const toolName = part.type.replace("tool-", "");

  if (toolName === "create_agent") {
    // Don't render any UI for create_agent tool - the Chain of Thought UI handles everything
    return null;
  }

  // Handle search tools
  if (toolName === "search") {
    const searchQuery = extractSearchQueryFromParts([part]);

    // For in-progress search tools, show loading state
    if ("state" in part && part.state !== "output-available") {
      if (searchQuery) {
        return (
          <UnifiedSearch
            isLoading={true}
            key={`search-loading-${index}`}
            query={searchQuery}
          />
        );
      }
      // Fallback to original loader if no query is available
      return (
        <div
          className="my-2 flex items-center gap-2 text-muted-foreground text-sm"
          key={`tool-${index}`}
        >
          <Loader text="Searching the web" />
        </div>
      );
    }

    // For completed search tools, render the unified search component with results
    if ("state" in part && part.state === "output-available") {
      const sources = extractSourcesFromParts([part]);

      if (searchQuery) {
        return (
          <UnifiedSearch
            isLoading={false}
            key={`search-results-${index}`}
            query={searchQuery}
            sources={sources}
          />
        );
      }
    }
  }

  // Handle connector tool calls (Composio tools)
  const isConnectorToolCall = isConnectorTool(toolName);

  if (isConnectorToolCall) {
    // Determine connector type from tool name
    const connectorType = getConnectorTypeFromToolName(toolName);

    // Handle different tool states based on AI SDK v5 ToolUIPart states
    if ("state" in part) {
      const isLoading =
        part.state === "input-streaming" || part.state === "input-available";
      const hasCompleted = part.state === "output-available";
      const hasError = part.state === "output-error";

      // Extract tool call data based on state
      const toolCallData: {
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
      } = {
        toolName,
        connectorType,
      };

      // Extract input/arguments if available
      if ("input" in part && part.input) {
        toolCallData.request = {
          action: toolName,
          parameters: part.input as Record<string, unknown>,
        };
      }

      // Extract output/result if available
      if (hasCompleted && "output" in part && part.output) {
        toolCallData.response = {
          success: true,
          data: part.output,
        };
      } else if (hasError && "error" in part && part.error) {
        toolCallData.response = {
          success: false,
          error:
            typeof part.error === "string"
              ? part.error
              : "Tool execution failed",
        };
      }

      // Add metadata
      toolCallData.metadata = {
        timestamp: new Date().toISOString(),
      };

      return (
        <ConnectorToolCall
          data={toolCallData}
          isLoading={isLoading}
          key={`connector-${part.state}-${index}`}
        />
      );
    }

    // Fallback for connector tools without proper state (shouldn't happen with AI SDK v5)
    const fallbackData: {
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
    } = {
      toolName,
      connectorType,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    return (
      <ConnectorToolCall
        data={fallbackData}
        isLoading={false}
        key={`connector-fallback-${index}`}
      />
    );
  }

  return null;
};

const renderErrorPart = (part: ErrorUIPart, index: number) => {
  return (
    <div
      className="mt-4 flex items-start gap-3 rounded-lg bg-red-500/15 px-4 py-3 text-red-900 text-sm dark:text-red-400"
      key={`error-${index}`}
      role="alert"
    >
      <div className="leading-relaxed">{part.error.message}</div>
    </div>
  );
};

// Helper function to reconstruct content parts from agent steps
const reconstructAgentContentParts = (
  steps: (AgentStepDataPart | AgentStepUpdateDataPart)[]
): MessageType["parts"] => {
  const contentParts: (MessageType["parts"][number] | null)[] = [];
  const textAccumulator: Record<
    string,
    { text: string; isStreaming: boolean; index?: number }
  > = {};
  const reasoningAccumulator: Record<
    string,
    { text: string; isStreaming: boolean; index?: number }
  > = {};
  const toolParts: Record<string, ToolUIPart> = {};

  // Process steps to reconstruct content
  for (const step of steps) {
    if (isAgentStepPart(step)) {
      const stepData = step.data;

      switch (stepData.type) {
        case "text":
          if (stepData.status === "start" && stepData.contentId) {
            const existing = textAccumulator[stepData.contentId];
            if (existing && typeof existing.index === "number") {
              textAccumulator[stepData.contentId] = {
                ...existing,
                isStreaming: true,
              };
            } else {
              const placeholderIndex = contentParts.length;
              contentParts.push({ type: "text", text: "" });
              textAccumulator[stepData.contentId] = {
                text: existing?.text ?? "",
                isStreaming: true,
                index: placeholderIndex,
              };
            }
          } else if (
            stepData.status === "end" &&
            stepData.contentId &&
            textAccumulator[stepData.contentId]
          ) {
            const accumulator = textAccumulator[stepData.contentId];
            accumulator.isStreaming = false;
            if (
              typeof accumulator.index === "number" &&
              accumulator.index < contentParts.length
            ) {
              if (accumulator.text.trim()) {
                contentParts[accumulator.index] = {
                  type: "text",
                  text: accumulator.text,
                };
              } else {
                contentParts[accumulator.index] = null;
              }
            }
          }
          break;

        case "reasoning":
          if (stepData.status === "start" && stepData.contentId) {
            const existing = reasoningAccumulator[stepData.contentId];
            if (existing && typeof existing.index === "number") {
              reasoningAccumulator[stepData.contentId] = {
                ...existing,
                isStreaming: true,
              };
            } else {
              const placeholderIndex = contentParts.length;
              contentParts.push({ type: "reasoning", text: "" });
              reasoningAccumulator[stepData.contentId] = {
                text: existing?.text ?? "",
                isStreaming: true,
                index: placeholderIndex,
              };
            }
          } else if (
            stepData.status === "end" &&
            stepData.contentId &&
            reasoningAccumulator[stepData.contentId]
          ) {
            const accumulator = reasoningAccumulator[stepData.contentId];
            accumulator.isStreaming = false;
            if (
              typeof accumulator.index === "number" &&
              accumulator.index < contentParts.length
            ) {
              if (accumulator.text.trim()) {
                contentParts[accumulator.index] = {
                  type: "reasoning",
                  text: accumulator.text,
                };
              } else {
                contentParts[accumulator.index] = null;
              }
            }
          }
          break;

        case "tool":
          if (stepData.toolCallId && stepData.toolName) {
            // Update based on status
            if (stepData.status === "input-available" && stepData.input) {
              // Check if this tool part already exists
              if (!toolParts[stepData.toolCallId]) {
                // Create tool part with input and add to contentParts immediately
                const inputToolPart = {
                  type: `tool-${stepData.toolName.toLowerCase().replace(/_/g, "-")}`,
                  toolCallId: stepData.toolCallId,
                  state: "input-available",
                  input: stepData.input,
                } as ToolUIPart;

                toolParts[stepData.toolCallId] = inputToolPart;
                contentParts.push(inputToolPart);
              }
            } else if (
              stepData.status === "output-available" &&
              stepData.output
            ) {
              // Handle output-available: always update/create the tool part
              const toolType = `tool-${stepData.toolName.toLowerCase().replace(/_/g, "-")}`;

              if (toolParts[stepData.toolCallId]) {
                // Update existing tool part
                const updatedToolPart = {
                  type: toolType,
                  toolCallId: stepData.toolCallId,
                  state: "output-available",
                  input:
                    toolParts[stepData.toolCallId].input ||
                    stepData.input ||
                    {},
                  output: stepData.output,
                } as ToolUIPart & {
                  state: "output-available";
                  input: unknown;
                  output: unknown;
                };

                // Update the toolParts record
                toolParts[stepData.toolCallId] = updatedToolPart;

                // Find and replace in contentParts
                const existingIndex = contentParts.findIndex(
                  (part) =>
                    part?.type.startsWith("tool-") &&
                    "toolCallId" in part &&
                    part.toolCallId === stepData.toolCallId
                );

                if (existingIndex !== -1) {
                  contentParts[existingIndex] = updatedToolPart;
                } else {
                  // Not found in contentParts, add it
                  contentParts.push(updatedToolPart);
                }
              } else {
                // No tool part exists yet, create a complete one
                const completeToolPart = {
                  type: toolType,
                  toolCallId: stepData.toolCallId,
                  state: "output-available",
                  input: stepData.input || {},
                  output: stepData.output,
                } as ToolUIPart & {
                  state: "output-available";
                  input: unknown;
                  output: unknown;
                };

                toolParts[stepData.toolCallId] = completeToolPart;
                contentParts.push(completeToolPart);
              }
            }
          }
          break;

        default:
          // Unknown step type, skip
          break;
      }
    } else if (isAgentStepUpdatePart(step)) {
      const updateData = step.data;

      if (
        updateData.type === "text" &&
        updateData.contentId &&
        updateData.delta
      ) {
        if (textAccumulator[updateData.contentId]) {
          const accumulator = textAccumulator[updateData.contentId];
          accumulator.text += updateData.delta;
          const index = accumulator.index;
          if (typeof index === "number" && index < contentParts.length) {
            contentParts[index] = {
              type: "text",
              text: accumulator.text,
            };
          }
        } else {
          const placeholderIndex = contentParts.length;
          const text = updateData.delta;
          contentParts.push({ type: "text", text });
          textAccumulator[updateData.contentId] = {
            text,
            isStreaming: true,
            index: placeholderIndex,
          };
        }
      } else if (
        updateData.type === "reasoning" &&
        updateData.contentId &&
        updateData.delta &&
        reasoningAccumulator[updateData.contentId]
      ) {
        const accumulator = reasoningAccumulator[updateData.contentId];
        accumulator.text += updateData.delta;
        const index = accumulator.index;
        if (typeof index === "number" && index < contentParts.length) {
          contentParts[index] = {
            type: "reasoning",
            text: accumulator.text,
          };
        }
        // Note: Tool deltas are not used in current sub-agent implementation
      } else if (
        updateData.type === "reasoning" &&
        updateData.contentId &&
        updateData.delta
      ) {
        const placeholderIndex = contentParts.length;
        const text = updateData.delta;
        contentParts.push({ type: "reasoning", text });
        reasoningAccumulator[updateData.contentId] = {
          text,
          isStreaming: true,
          index: placeholderIndex,
        };
      }
    }
  }

  // Add any streaming content that's still in progress
  for (const acc of Object.values(textAccumulator)) {
    if (acc.isStreaming && acc.text.trim() && typeof acc.index !== "number") {
      contentParts.push({ type: "text", text: acc.text });
    }
  }

  for (const acc of Object.values(reasoningAccumulator)) {
    if (acc.isStreaming && acc.text.trim() && typeof acc.index !== "number") {
      contentParts.push({ type: "reasoning", text: acc.text });
    }
  }

  return contentParts.filter(
    (part): part is MessageType["parts"][number] => part !== null
  );
};

// Helper function to group agent data parts while preserving stream order
type AgentGroup = {
  agentId: string;
  startIndex: number;
  start: AgentStartDataPart;
  steps: (AgentStepDataPart | AgentStepUpdateDataPart)[];
  end?: AgentEndDataPart;
  error?: AgentErrorDataPart;
};

type OrderedPart =
  | {
      kind: "regular";
      index: number;
      part: MessageType["parts"][number];
    }
  | {
      kind: "agent";
      index: number;
      group: AgentGroup;
    };

const resolveAgentIdForStep = (
  groups: Record<string, AgentGroup>,
  part: AgentStepDataPart | AgentStepUpdateDataPart
) => {
  const candidates = Object.keys(groups);
  for (const candidate of candidates) {
    if (part.id.startsWith(candidate)) {
      return candidate;
    }
    if ("stepId" in part.data && part.data.stepId.startsWith(candidate)) {
      return candidate;
    }
  }
  return null;
};

const groupAgentDataParts = (parts: MessageType["parts"]) => {
  if (!parts) {
    return [] as OrderedPart[];
  }

  const agentGroups: Record<string, AgentGroup> = {};
  const orderedParts: OrderedPart[] = [];

  parts.forEach((part, index) => {
    if (isAgentStartPart(part)) {
      const agentId = part.data.agentId;
      const group: AgentGroup = {
        agentId,
        startIndex: index,
        start: part,
        steps: [],
      };

      agentGroups[agentId] = group;
      orderedParts.push({ kind: "agent", index, group });
      return;
    }

    if (isAgentStepPart(part) || isAgentStepUpdatePart(part)) {
      const agentId = resolveAgentIdForStep(agentGroups, part);
      if (agentId) {
        agentGroups[agentId].steps.push(part);
      }
      return;
    }

    if (isAgentEndPart(part)) {
      const group = agentGroups[part.data.agentId];
      if (group) {
        group.end = part;
      }
      return;
    }

    if (isAgentErrorPart(part)) {
      const group = agentGroups[part.data.agentId];
      if (group) {
        group.error = part;
      }
      return;
    }

    if (!isAgentDataPart(part)) {
      orderedParts.push({ kind: "regular", index, part });
    }
  });

  return orderedParts.sort((a, b) => a.index - b.index);
};

function MessageAssistantInner({
  isLast,
  hasScrollAnchor,
  copied,
  copyToClipboard,
  onReload,
  onBranch,
  model,
  parts,
  status,
  id,
  metadata,
  readOnly = false,
}: MessageAssistantProps) {
  // Prefer `parts` prop, but fall back to `attachments` if `parts` is undefined.
  const combinedParts = parts || [];

  const orderedParts = useMemo(
    () => groupAgentDataParts(combinedParts),
    [combinedParts]
  );

  // State for reasoning collapse/expand functionality - track each reasoning part individually
  const [reasoningStates, setReasoningStates] = useState<
    Record<string, boolean>
  >({});
  // Track which reasoning parts were initially streaming (to show correct UI)
  const [reasoningStreamingStates, setReasoningStreamingStates] = useState<
    Record<string, boolean>
  >({});
  const initialStatusRef = useRef<Record<string, boolean>>({});
  const [isTouch, setIsTouch] = useState(false);

  const [agentOpenStates, setAgentOpenStates] = useState<
    Record<string, boolean>
  >({});
  const agentManualOverrideRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    setAgentOpenStates((prevStates) => {
      let nextStates = prevStates;
      let hasChanges = false;
      const presentAgents = new Set<string>();

      orderedParts.forEach((item, orderedIndex) => {
        if (item.kind !== "agent") {
          return;
        }

        const { agentId, end, error } = item.group;
        presentAgents.add(agentId);

        if (agentManualOverrideRef.current[agentId] === undefined) {
          agentManualOverrideRef.current[agentId] = false;
        }

        const hasNextStreamingText =
          status === "streaming" &&
          orderedParts.slice(orderedIndex + 1).some((nextItem) => {
            if (nextItem.kind !== "regular") {
              return false;
            }
            const nextPart = nextItem.part;
            return nextPart.type === "text";
          });

        const shouldAutoClose =
          Boolean(end || error) &&
          (status !== "streaming" || hasNextStreamingText);
        const desiredState = !shouldAutoClose;

        if (prevStates[agentId] === undefined) {
          if (!hasChanges) {
            nextStates = { ...prevStates };
            hasChanges = true;
          }
          nextStates[agentId] = desiredState;
        }

        if (
          agentManualOverrideRef.current[agentId] === false &&
          prevStates[agentId] !== desiredState
        ) {
          if (!hasChanges) {
            nextStates = { ...prevStates };
            hasChanges = true;
          }
          nextStates[agentId] = desiredState;
        }
      });

      if (
        Object.keys(prevStates).some((agentId) => !presentAgents.has(agentId))
      ) {
        if (!hasChanges) {
          nextStates = { ...prevStates };
          hasChanges = true;
        }

        for (const agentId of Object.keys(prevStates)) {
          if (!presentAgents.has(agentId)) {
            delete nextStates[agentId];
            delete agentManualOverrideRef.current[agentId];
          }
        }
      }

      return hasChanges ? nextStates : prevStates;
    });
  }, [orderedParts, status]);

  // Initialize reasoning states - only run once when reasoning parts are first detected
  useEffect(() => {
    if (combinedParts) {
      // Calculate new states in a single pass
      let newStates: Record<string, boolean> = {};
      let newStreamingStates: Record<string, boolean> = {};
      let hasStateChanges = false;
      let hasStreamingChanges = false;

      // Update both reasoning states in a single operation
      setReasoningStates((prevStates) => {
        setReasoningStreamingStates((prevStreamingStates) => {
          newStates = { ...prevStates };
          newStreamingStates = { ...prevStreamingStates };

          // Single pass through combinedParts to update both states
          combinedParts.forEach((part, index) => {
            if (part.type === "reasoning") {
              const key = `${id}-${index}`;

              // Handle reasoning states
              const hasContent = Boolean(
                part.text && part.text.trim().length > 0
              );
              const isCurrentlyStreaming = status === "streaming";

              if (!(key in newStates)) {
                // Initialize new reasoning part - start closed if no content
                newStates[key] = hasContent && isCurrentlyStreaming;
                hasStateChanges = true;
              } else if (
                isCurrentlyStreaming &&
                hasContent &&
                !newStates[key]
              ) {
                // Expand if we're streaming and content appears for the first time
                newStates[key] = true;
                hasStateChanges = true;
              }

              // Handle streaming states
              if (!(key in newStreamingStates)) {
                const isInitiallyStreaming = status === "streaming";
                newStreamingStates[key] = isInitiallyStreaming;
                // Store the initial status in ref to avoid re-initialization
                initialStatusRef.current[key] = isInitiallyStreaming;
                hasStreamingChanges = true;
              }
            }
          });

          // During streaming, handle collapsing and loading states for reasoning parts that have non-reasoning content after them
          if (status === "streaming") {
            combinedParts.forEach((part, index) => {
              if (part.type === "reasoning") {
                const key = `${id}-${index}`;
                // Check if there are non-reasoning parts after this reasoning part
                const hasSubsequentNonReasoningParts = combinedParts
                  .slice(index + 1)
                  .some((p) => p.type !== "reasoning");

                if (hasSubsequentNonReasoningParts) {
                  // Collapse this specific reasoning block
                  if (newStates[key]) {
                    newStates[key] = false;
                    hasStateChanges = true;
                  }

                  // Turn off loading for this reasoning part
                  if (newStreamingStates[key]) {
                    newStreamingStates[key] = false;
                    hasStreamingChanges = true;
                  }
                }
              }
            });
          } else {
            // When not streaming, turn off all reasoning streaming states (loading indicators)
            combinedParts.forEach((part, index) => {
              if (part.type === "reasoning") {
                const key = `${id}-${index}`;
                // Turn off loading for this reasoning part if it's currently on
                if (newStreamingStates[key]) {
                  newStreamingStates[key] = false;
                  hasStreamingChanges = true;
                }
              }
            });
          }

          return hasStreamingChanges ? newStreamingStates : prevStreamingStates;
        });

        return hasStateChanges ? newStates : prevStates;
      });
    }
  }, [combinedParts, id, status]);

  // Extract model from metadata or use direct model prop as fallback
  const modelFromMetadata = metadata?.modelName || metadata?.modelId;
  const displayModel = modelFromMetadata || model;
  const reasoningEffort = metadata?.reasoningEffort;

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
    }
  }, []);

  // Helper function to toggle individual reasoning part
  const toggleReasoning = (index: number) => {
    const key = `${id}-${index}`;
    setReasoningStates((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <Message
      className={cn(
        "group flex w-full max-w-3xl flex-1 items-start gap-4 px-6 pb-2",
        hasScrollAnchor && "min-h-scroll-anchor"
      )}
      id={id}
    >
      <div className={cn("flex w-full flex-col gap-2", isLast && "pb-8")}>
        {/* Render agent data parts and regular parts */}
        {orderedParts.map((item) => {
          if (item.kind === "regular") {
            const { part, index } = item;
            const partKey = `${part.type}-${index}`;

            switch (part.type) {
              case "text":
                return renderTextPart(
                  part as { type: "text"; text: string },
                  index,
                  id
                );

              case "reasoning":
                return renderReasoningPart(
                  part as ReasoningUIPart,
                  index,
                  id,
                  reasoningStates[`${id}-${index}`],
                  () => toggleReasoning(index),
                  reasoningStreamingStates[`${id}-${index}`]
                );

              case "file":
                return (
                  <div className="flex w-full flex-wrap gap-2" key={partKey}>
                    {renderFilePart(part as FileUIPart, index)}
                  </div>
                );

              default:
                if (part.type.startsWith("tool-")) {
                  return renderToolPart(part as ToolUIPart, index, id);
                }
                if (isErrorPart(part)) {
                  return renderErrorPart(part, index);
                }
                return null;
            }
          }

          const { group } = item;
          const { agentId, start, steps: agentSteps, error, end } = group;

          const agentContentParts = reconstructAgentContentParts(agentSteps);
          const hasCompleted = Boolean(end || error);
          const agentState = agentOpenStates[agentId];
          const effectiveAgentOpen = agentState ?? !hasCompleted;
          const autoScrollKey = hasCompleted ? undefined : agentSteps.length;

          return (
            <ChainOfThought
              key={agentId}
              onOpenChange={(open) => {
                agentManualOverrideRef.current[agentId] = true;
                setAgentOpenStates((prev) => ({
                  ...prev,
                  [agentId]: open,
                }));
              }}
              open={effectiveAgentOpen}
              tools={start.data.tool}
            >
              <ChainOfThoughtHeader tools={start.data.tool}>
                {start.data.task.length > 50
                  ? `${start.data.task.slice(0, 50)}...`
                  : start.data.task}
              </ChainOfThoughtHeader>
              <ChainOfThoughtContent autoScrollKey={autoScrollKey}>
                {agentContentParts.map((part, contentIndex) => {
                  const partKey = `${agentId}-content-${contentIndex}`;

                  switch (part.type) {
                    case "text":
                      return (
                        <ChainOfThoughtStep
                          key={partKey}
                          label="Agent response"
                          status="complete"
                        >
                          {renderTextPart(
                            part as { type: "text"; text: string },
                            contentIndex,
                            `${id}-agent-${agentId}`
                          )}
                        </ChainOfThoughtStep>
                      );

                    case "reasoning":
                      return (
                        <ChainOfThoughtStep
                          key={partKey}
                          label="Agent reasoning"
                          status="complete"
                        >
                          {renderReasoningPart(
                            part as ReasoningUIPart,
                            contentIndex,
                            `${id}-agent-${agentId}`,
                            reasoningStates[
                              `${id}-agent-${agentId}-${contentIndex}`
                            ],
                            () => {
                              const key = `${id}-agent-${agentId}-${contentIndex}`;
                              setReasoningStates((prev) => ({
                                ...prev,
                                [key]: !prev[key],
                              }));
                            },
                            reasoningStreamingStates[
                              `${id}-agent-${agentId}-${contentIndex}`
                            ]
                          )}
                        </ChainOfThoughtStep>
                      );

                    case "file":
                      return (
                        <ChainOfThoughtStep
                          key={partKey}
                          label="File attachment"
                          status="complete"
                        >
                          <div className="flex w-full flex-wrap gap-2">
                            {renderFilePart(part as FileUIPart, contentIndex)}
                          </div>
                        </ChainOfThoughtStep>
                      );

                    default:
                      if (part.type.startsWith("tool-")) {
                        const toolPart = part as ToolUIPart & {
                          toolName?: string;
                        };
                        const toolLabel = toolPart.toolName
                          ? `Using ${toolPart.toolName} tool`
                          : "Using tool";

                        return (
                          <ChainOfThoughtStep
                            key={partKey}
                            label={toolLabel}
                            status="complete"
                          >
                            {renderToolPart(
                              toolPart,
                              contentIndex,
                              `${id}-agent-${agentId}`
                            )}
                          </ChainOfThoughtStep>
                        );
                      }
                      if (isErrorPart(part)) {
                        return (
                          <ChainOfThoughtStep
                            key={partKey}
                            label="Error occurred"
                            status="complete"
                          >
                            {renderErrorPart(part, contentIndex)}
                          </ChainOfThoughtStep>
                        );
                      }
                      return null;
                  }
                })}

                {error && (
                  <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-red-800 text-sm dark:bg-red-900/20 dark:text-red-300">
                    <div className="font-medium">Error:</div>
                    <div className="mt-1">{error.data.error}</div>
                  </div>
                )}
              </ChainOfThoughtContent>
            </ChainOfThought>
          );
        })}

        {/* Render sources list for non-search sources only */}
        {(() => {
          // Get all sources
          const allSources = extractSourcesFromParts(combinedParts);
          const searchQuery = extractSearchQueryFromParts(combinedParts);

          // If we have search sources, they are already rendered inline, so skip them
          if (searchQuery && allSources.length > 0) {
            return null;
          }

          // Only render SourcesList for non-search sources
          return allSources.length > 0 ? (
            <SourcesList sources={allSources} />
          ) : null;
        })()}

        <MessageActions
          className={cn(
            "flex gap-0 transition-opacity",
            isTouch
              ? "opacity-100"
              : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
          )}
        >
          <MessageAction
            delayDuration={0}
            side="bottom"
            tooltip={copied ? "Copied!" : "Copy text"}
          >
            <button
              aria-label="Copy text"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
              disabled={status === "streaming"}
              onClick={copyToClipboard}
              type="button"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </MessageAction>
          {!readOnly && (
            <MessageAction
              delayDuration={0}
              side="bottom"
              tooltip="Create a new chat starting from here"
            >
              <button
                aria-label="Branch chat"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
                disabled={status === "streaming"}
                onClick={onBranch}
                type="button"
              >
                <GitBranch className="size-4 rotate-180" />
              </button>
            </MessageAction>
          )}
          {!readOnly && (
            <MessageAction delayDuration={0} side="bottom" tooltip="Regenerate">
              <button
                aria-label="Regenerate"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent transition disabled:cursor-not-allowed disabled:opacity-50"
                disabled={status === "streaming"}
                onClick={onReload}
                type="button"
              >
                <ArrowClockwise className="size-4" />
              </button>
            </MessageAction>
          )}
          {displayModel && (
            <span className="ml-2 inline-block text-muted-foreground text-xs">
              {formatModelDisplayText(displayModel, reasoningEffort)}
            </span>
          )}
        </MessageActions>
      </div>
    </Message>
  );
}

// Default shallow comparison is fine – re-render will happen whenever
// `parts`, `attachments`, `status`, or any primitive prop reference changes
// which is what we want during streaming.
export const MessageAssistant = memo(MessageAssistantInner);

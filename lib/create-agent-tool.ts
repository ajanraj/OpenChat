import type {
  LanguageModelUsage,
  Tool,
  ToolSet,
  TypedToolCall,
  TypedToolResult,
  UIMessage,
} from "ai";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { getComposioTools } from "@/lib/composio-server";
import { getConnectorTypeFromToolName } from "@/lib/config/tools";
import type { ConnectorStatusLists } from "@/lib/connector-utils";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

const toolNameSchema = z.string().min(1, "Tool name is required");

const toolListSchema = z.union([
  toolNameSchema,
  z.array(toolNameSchema).min(1, "At least one tool is required"),
]);

const createAgentInputSchema = z.object({
  tool: toolListSchema.describe(
    'One or more connector toolkits to enable (e.g. "GMAIL", "NOTION").'
  ),
  task: z
    .string()
    .min(1, "Task description is required")
    .max(2000, "Task must be 2000 characters or less")
    .describe("High-level task for the delegated agent to complete."),
});

type RawCreateAgentInput = z.infer<typeof createAgentInputSchema>;

export type CreateAgentInput = RawCreateAgentInput & {
  tool: string | string[];
};

export type AgentToolCallStatus = "pending" | "success" | "error";

export type AgentToolCall = {
  toolCallId: string;
  toolName: string;
  connectorType: string;
  input?: Record<string, JSONValue>;
  output?: JSONValue;
  error?: string;
  status: AgentToolCallStatus;
};

export type CreateAgentRunStatus = "in-progress" | "succeeded" | "failed";

export type CreateAgentResult = {
  status: CreateAgentRunStatus;
  success: boolean;
  task: string;
  requestedTools: string[];
  finalText?: string;
  toolCalls: AgentToolCall[];
  usage?: LanguageModelUsage;
  error?: string;
};

type CreateAgentToolOptions = {
  userId?: string;
  availableToolkits: string[];
  model: string;
  systemPrompt?: string;
  maxSteps?: number;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  connectorsStatus?: ConnectorStatusLists;
};

const buildInnerSystemPrompt = (
  task: string,
  requestedToolkits: string[],
  connectorsStatus?: ConnectorStatusLists
): string => {
  const enabledList = connectorsStatus?.enabled ?? [];
  const disabledList = connectorsStatus?.disabled ?? [];
  const notConnectedList = connectorsStatus?.notConnected ?? [];

  return `You are a focused operations agent. Your job is to complete the task provided by the supervisor using ONLY the enabled tools.\n\nTask: ${task}\nEnabled toolkits available to you: ${requestedToolkits.join(", ")}\nOther toolkits for context:\n- Enabled (outside request): ${
    enabledList
      .filter((slug) => !requestedToolkits.includes(slug))
      .join(", ") || "none"
  }\n- Disabled: ${disabledList.join(", ") || "none"}\n- Not connected: ${notConnectedList.join(", ") || "none"}\n\nWork autonomously using the supplied tools. Prefer minimal reasoning tokens and return a concise summary once finished.`;
};

const getUsageOrUndefined = async (
  usagePromise: Promise<LanguageModelUsage>
): Promise<LanguageModelUsage | undefined> => {
  try {
    return await usagePromise;
  } catch {
    return;
  }
};

type MinimalStepResult = {
  toolCalls: TypedToolCall<ToolSet>[];
  toolResults: TypedToolResult<ToolSet>[];
};

const mapToolCallsFromSteps = (steps: MinimalStepResult[]): AgentToolCall[] => {
  const mappedCalls: AgentToolCall[] = [];

  for (const step of steps) {
    for (const call of step.toolCalls) {
      const connectorType = (() => {
        try {
          return getConnectorTypeFromToolName(call.toolName);
        } catch {
          return call.toolName;
        }
      })();

      const matchingResult = step.toolResults.find(
        (result) => result.toolCallId === call.toolCallId
      );

      mappedCalls.push({
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        connectorType,
        input:
          call.input && typeof call.input === "object"
            ? (call.input as Record<string, JSONValue>)
            : undefined,
        output: matchingResult?.output as JSONValue | undefined,
        error: matchingResult ? undefined : "Tool did not return a result.",
        status: matchingResult ? "success" : "error",
      });
    }
  }

  return mappedCalls;
};

export const createAgentTool = ({
  userId,
  availableToolkits,
  model,
  systemPrompt,
  maxSteps = 8,
  providerOptions,
  connectorsStatus,
}: CreateAgentToolOptions): Tool => {
  const connectorListDescription =
    availableToolkits.length > 0
      ? availableToolkits.join(", ")
      : "(no connectors available)";

  return tool({
    description: `Create a temporary agent that can use specific connectors to complete a task. Provide the connectors via the \`tool\` field and the high-level goal via \`task\`. Available connectors: ${connectorListDescription}.`,
    inputSchema: createAgentInputSchema,
    async *execute(input) {
      const toolValues = Array.isArray(input.tool) ? input.tool : [input.tool];

      const requestedToolkits = Array.from(
        new Set(
          toolValues
            .map((rawValue) => rawValue.trim())
            .filter((value) => value.length > 0)
            .map((value) => value.toUpperCase())
        )
      );

      if (requestedToolkits.length === 0) {
        return {
          status: "failed",
          success: false,
          task: input.task,
          requestedTools: [],
          toolCalls: [],
          error: "At least one connector toolkit must be specified.",
        } satisfies CreateAgentResult;
      }

      if (!userId) {
        return {
          status: "failed",
          success: false,
          task: input.task,
          requestedTools: requestedToolkits,
          toolCalls: [],
          error: "User session required to use connectors.",
        } satisfies CreateAgentResult;
      }

      const availableSet = new Set(
        availableToolkits.map((slug) => slug.toUpperCase())
      );
      const unavailable = requestedToolkits.filter(
        (slug) => !availableSet.has(slug)
      );

      if (unavailable.length > 0) {
        return {
          status: "failed",
          success: false,
          task: input.task,
          requestedTools: requestedToolkits,
          toolCalls: [],
          error: `Unavailable connectors requested: ${unavailable.join(", ")}. Enable them in settings and try again.`,
        } satisfies CreateAgentResult;
      }

      let composioTools: Record<string, Tool> = {};
      try {
        const rawTools = await getComposioTools(userId, requestedToolkits);
        const filteredTools: Record<string, Tool> = {};
        for (const [toolName, candidate] of Object.entries(rawTools)) {
          if (
            candidate &&
            typeof candidate === "object" &&
            "execute" in candidate &&
            typeof (candidate as Tool).execute === "function"
          ) {
            filteredTools[toolName] = candidate as Tool;
          }
        }
        composioTools = filteredTools;
      } catch (error) {
        return {
          status: "failed",
          success: false,
          task: input.task,
          requestedTools: requestedToolkits,
          toolCalls: [],
          error:
            error instanceof Error
              ? error.message
              : "Failed to load connector tools.",
        } satisfies CreateAgentResult;
      }

      if (Object.keys(composioTools).length === 0) {
        return {
          status: "failed",
          success: false,
          task: input.task,
          requestedTools: requestedToolkits,
          toolCalls: [],
          error: "No connector tools available for the requested selection.",
        } satisfies CreateAgentResult;
      }

      const toolCallOrder: string[] = [];
      const toolCallsMap = new Map<string, AgentToolCall>();
      let aggregatedText = "";

      const snapshotToolCalls = (): AgentToolCall[] =>
        toolCallOrder
          .map((id) => toolCallsMap.get(id))
          .filter((entry): entry is AgentToolCall => Boolean(entry));

      const shouldEmitProgress = (): boolean =>
        toolCallOrder.length > 0 || aggregatedText.trim().length > 0;

      try {
        const innerSystem =
          systemPrompt ??
          buildInnerSystemPrompt(
            input.task,
            requestedToolkits,
            connectorsStatus
          );

        const agentUserMessage: UIMessage = {
          id: "create-agent-task",
          role: "user",
          parts: [{ type: "text", text: input.task }],
        };

        const result = streamText({
          model,
          system: innerSystem,
          messages: convertToModelMessages([agentUserMessage]),
          tools: composioTools,
          stopWhen: stepCountIs(maxSteps),
          providerOptions,
        });

        try {
          for await (const chunk of result.fullStream) {
            if (chunk.type === "text-delta") {
              aggregatedText += chunk.text;
              if (shouldEmitProgress()) {
                yield {
                  status: "in-progress",
                  success: false,
                  task: input.task,
                  requestedTools: requestedToolkits,
                  toolCalls: snapshotToolCalls(),
                  finalText: aggregatedText.trim() || undefined,
                } satisfies CreateAgentResult;
              }
              continue;
            }

            if (chunk.type === "tool-call") {
              const connectorType = (() => {
                try {
                  return getConnectorTypeFromToolName(chunk.toolName);
                } catch {
                  return chunk.toolName;
                }
              })();

              const existing = toolCallsMap.get(chunk.toolCallId);
              const updated: AgentToolCall = {
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                connectorType,
                input:
                  chunk.input && typeof chunk.input === "object"
                    ? (chunk.input as Record<string, JSONValue>)
                    : undefined,
                output: existing?.output,
                error: existing?.error,
                status: existing?.status ?? "pending",
              };

              if (!existing) {
                toolCallOrder.push(chunk.toolCallId);
              }

              toolCallsMap.set(chunk.toolCallId, updated);

              if (shouldEmitProgress()) {
                yield {
                  status: "in-progress",
                  success: false,
                  task: input.task,
                  requestedTools: requestedToolkits,
                  toolCalls: snapshotToolCalls(),
                  finalText: aggregatedText.trim() || undefined,
                } satisfies CreateAgentResult;
              }

              continue;
            }

            if (chunk.type === "tool-result") {
              const existing = toolCallsMap.get(chunk.toolCallId);
              if (!existing) {
                continue;
              }

              const isPreliminary =
                "preliminary" in chunk && chunk.preliminary === true;
              existing.output = chunk.output as JSONValue;
              existing.error = undefined;
              existing.status = isPreliminary ? "pending" : "success";
              toolCallsMap.set(chunk.toolCallId, existing);

              if (shouldEmitProgress()) {
                yield {
                  status: "in-progress",
                  success: false,
                  task: input.task,
                  requestedTools: requestedToolkits,
                  toolCalls: snapshotToolCalls(),
                  finalText: aggregatedText.trim() || undefined,
                } satisfies CreateAgentResult;
              }

              continue;
            }

            if (chunk.type === "tool-error") {
              const existing = toolCallsMap.get(chunk.toolCallId);
              const errorMessage =
                typeof chunk.error === "string"
                  ? chunk.error
                  : "Tool execution failed.";

              if (existing) {
                existing.status = "error";
                existing.error = errorMessage;
                toolCallsMap.set(chunk.toolCallId, existing);
              }

              const failureSnapshot = snapshotToolCalls();

              yield {
                status: "failed",
                success: false,
                task: input.task,
                requestedTools: requestedToolkits,
                toolCalls: failureSnapshot,
                finalText: aggregatedText.trim() || undefined,
                error: errorMessage,
              } satisfies CreateAgentResult;

              return {
                status: "failed",
                success: false,
                task: input.task,
                requestedTools: requestedToolkits,
                toolCalls: failureSnapshot,
                finalText: aggregatedText.trim() || undefined,
                error: errorMessage,
              } satisfies CreateAgentResult;
            }
          }
        } catch (streamError) {
          const failureSnapshot = snapshotToolCalls();

          return {
            status: "failed",
            success: false,
            task: input.task,
            requestedTools: requestedToolkits,
            toolCalls: failureSnapshot,
            finalText: aggregatedText.trim() || undefined,
            error:
              streamError instanceof Error
                ? streamError.message
                : "Delegated agent execution failed.",
          } satisfies CreateAgentResult;
        }

        const [finalTextRaw, steps, usage] = await Promise.all([
          result.text,
          result.steps,
          getUsageOrUndefined(result.totalUsage),
        ]);

        const toolCalls = mapToolCallsFromSteps(steps);

        return {
          status: "succeeded",
          success: true,
          task: input.task,
          requestedTools: requestedToolkits,
          finalText: finalTextRaw.trim(),
          toolCalls,
          usage,
        } satisfies CreateAgentResult;
      } catch (error) {
        return {
          status: "failed",
          success: false,
          task: input.task,
          requestedTools: requestedToolkits,
          toolCalls: snapshotToolCalls(),
          finalText: aggregatedText.trim() || undefined,
          error:
            error instanceof Error
              ? error.message
              : "Agent execution failed unexpectedly.",
        } satisfies CreateAgentResult;
      }
    },
  });
};

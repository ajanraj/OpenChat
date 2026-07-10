import type { Tool, ToolSet, TypedToolResult, UIMessage, UIMessageStreamWriter } from "ai";
import { convertToModelMessages, isStepCount, streamText, toUIMessageStream, tool } from "ai";
import { z } from "zod";
import { getComposioTools } from "@/lib/composio-server";
import type { ConnectorStatusLists } from "@/lib/connector-utils";
import { getToolSpecificPrompts } from "@/lib/prompt-tool-config";

const toolNameSchema = z.string().min(1, "Tool name is required");
const COMPOSIO_MULTI_EXECUTE_TOOL = "COMPOSIO_MULTI_EXECUTE_TOOL";
const COMPOSIO_TOOL_ROUTER_INSTRUCTIONS =
  "Use COMPOSIO_SEARCH_TOOLS first with atomic, toolkit-scoped queries to discover the required tool schemas. Reuse its returned session_id for later schema lookups and COMPOSIO_MULTI_EXECUTE_TOOL calls. Then execute connector actions with COMPOSIO_MULTI_EXECUTE_TOOL. A search alone does not complete the task. Do not claim success unless COMPOSIO_MULTI_EXECUTE_TOOL returns a successful result. If an account is disconnected, stop and ask the user to reconnect it in Settings; do not attempt connection management.";

export const appendComposioToolRouterInstructions = (instructions: string): string =>
  `${instructions}\n\n${COMPOSIO_TOOL_ROUTER_INSTRUCTIONS}`;

export const toolListSchema = z.union([
  toolNameSchema,
  z.array(toolNameSchema).min(1, "At least one tool is required"),
]);

export const createAgentInputSchema = z.object({
  tool: toolListSchema.describe(
    'One or more connector toolkits to enable (e.g. "GMAIL", "NOTION").',
  ),
  task: z
    .string()
    .min(1, "Task description is required")
    .max(2000, "Task must be 2000 characters or less")
    .describe("High-level task for the delegated agent to complete."),
  context: z
    .string()
    .max(5000, "Context must be 5000 characters or less")
    .optional()
    .describe("Optional context from previous operations to provide to the agent."),
});

export type CreateAgentInput = z.input<typeof createAgentInputSchema>;

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>;

interface CreateAgentToolOptions {
  userId?: string;
  availableToolkits: string[];
  model: string;
  systemPrompt?: string;
  maxSteps?: number;
  providerOptions?: ProviderOptions;
  connectorsStatus?: ConnectorStatusLists;
  writer: UIMessageStreamWriter;
}

export interface SubAgentAnalysis {
  success: boolean;
  toolCallCount: number;
  toolNames: string[];
  finishReason: string;
  issues: string[];
  summary: string;
  errorMessage?: string;
}

type SubAgentToolResult = TypedToolResult<ToolSet>;

const connectorToolOutputSchema = z.object({
  error: z.string().nullable().optional(),
  successful: z.boolean(),
});

const isSuccessfulConnectorResult = (result: SubAgentToolResult): boolean => {
  const parsed = connectorToolOutputSchema.safeParse(result.output);
  return parsed.success && (parsed.data.error === null || parsed.data.error === undefined);
};

const getConnectorResultError = (result: SubAgentToolResult): string | null => {
  const parsed = connectorToolOutputSchema.safeParse(result.output);
  return parsed.success && parsed.data.error ? parsed.data.error : null;
};

export const analyzeSubAgentExecution = ({
  toolCalls,
  toolResults,
  finishReason,
  finalText,
  subAgentError,
}: {
  toolCalls: { toolName: string; [key: string]: unknown }[];
  toolResults: SubAgentToolResult[];
  finishReason: string;
  finalText: string;
  subAgentError: Error | null;
}): SubAgentAnalysis => {
  const toolCallCount = toolCalls.length;
  const toolNames = toolCalls.map((tc) => tc.toolName);

  // Determine completion status
  const attemptedTools = toolCallCount > 0;
  const connectorActionCalls = toolCalls.filter(
    ({ toolName }) => toolName.toUpperCase() === COMPOSIO_MULTI_EXECUTE_TOOL,
  );
  const connectorActionResults = toolResults.filter(
    ({ toolName }) => toolName.toUpperCase() === COMPOSIO_MULTI_EXECUTE_TOOL,
  );
  const executedConnectorAction = connectorActionCalls.length > 0;
  const connectorActionsSucceeded =
    executedConnectorAction &&
    connectorActionResults.length === connectorActionCalls.length &&
    connectorActionResults.every(isSuccessfulConnectorResult);
  const normalFinish = finishReason === "stop" || finishReason === "length";
  const hasSubstantialOutput = finalText.length > 25;
  const hasError = subAgentError !== null;

  const success = connectorActionsSucceeded && normalFinish && hasSubstantialOutput && !hasError;

  const issues: string[] = [];
  if (hasError) {
    issues.push(`Error: ${subAgentError?.message || "Unknown error"}`);
  }
  if (!attemptedTools) {
    issues.push("No tools were called");
  } else if (!executedConnectorAction) {
    issues.push("No connector action was executed");
  } else if (connectorActionResults.length < connectorActionCalls.length) {
    issues.push("Connector action produced no result");
  } else if (!connectorActionsSucceeded) {
    const resultErrors = connectorActionResults
      .map(getConnectorResultError)
      .filter((message): message is string => message !== null);
    issues.push(
      resultErrors.length > 0
        ? `Connector action failed: ${resultErrors.join("; ")}`
        : "Connector action failed",
    );
  }
  if (finishReason === "error") {
    issues.push("Sub-agent encountered an error");
  }
  if (finishReason === "tool-calls") {
    issues.push("Sub-agent stopped mid-execution");
  }
  if (!hasSubstantialOutput) {
    issues.push("Insufficient output produced");
  }

  return {
    success,
    toolCallCount,
    toolNames,
    finishReason,
    issues,
    summary: finalText.slice(0, 300),
    errorMessage: subAgentError?.message,
  };
};

const buildInnerSystemPrompt = (
  task: string,
  requestedToolkits: string[],
  connectorsStatus?: ConnectorStatusLists,
): string => {
  const enabledList = connectorsStatus?.enabled ?? [];
  const disabledList = connectorsStatus?.disabled ?? [];
  const notConnectedList = connectorsStatus?.notConnected ?? [];

  // Get tool-specific prompts based on requested toolkits
  const toolSpecificPrompts = getToolSpecificPrompts(requestedToolkits);

  let systemPrompt = `You are a focused operations agent. Your job is to complete the task provided by the supervisor using ONLY the enabled tools.\n\nTask: ${task}\nEnabled toolkits available to you: ${requestedToolkits.join(", ")}\nOther toolkits for context:\n- Enabled (outside request): ${
    enabledList.filter((slug: string) => !requestedToolkits.includes(slug)).join(", ") || "none"
  }\n- Disabled: ${disabledList.join(", ") || "none"}\n- Not connected: ${notConnectedList.join(", ") || "none"}`;

  // Add tool-specific guidance if available
  if (toolSpecificPrompts) {
    systemPrompt += `\n\n${toolSpecificPrompts}`;
  }

  systemPrompt +=
    "\n\nWork autonomously using the supplied tools. Prefer minimal reasoning tokens and return a concise summary once finished.";

  return systemPrompt;
};

export const createAgentTool = ({
  userId,
  availableToolkits,
  model,
  systemPrompt,
  maxSteps = 8,
  providerOptions,
  connectorsStatus,
  writer,
}: CreateAgentToolOptions): Tool<CreateAgentInput, string> => {
  const connectorListDescription =
    availableToolkits.length > 0 ? availableToolkits.join(", ") : "(no connectors available)";

  return tool({
    description: `Create a temporary agent that can use specific connectors to complete a task. Provide the connectors via the \`tool\` field, the high-level goal via \`task\`, and optional context from previous operations via \`context\`. Available connectors: ${connectorListDescription}.`,
    inputSchema: createAgentInputSchema,
    toModelOutput: ({ output }) => {
      try {
        const analysis: SubAgentAnalysis = JSON.parse(output);

        if (!analysis.success) {
          const issueDetails = analysis.issues.join("; ");
          return {
            type: "text",
            value: `Sub-agent failed to complete task. Issues: ${issueDetails}. Tools called: ${analysis.toolCallCount} (${analysis.toolNames.join(", ") || "none"}). Finish reason: ${analysis.finishReason}. Consider different approach or retry.`,
          };
        }

        return {
          type: "text",
          value: `Sub-agent completed task successfully. Used tools: ${analysis.toolNames.join(", ") || "none"} (${analysis.toolCallCount} calls). Result: ${analysis.summary.slice(0, 150)}${analysis.summary.length > 150 ? "..." : ""}`,
        };
      } catch (error) {
        console.error("Failed to parse sub-agent result:", error);
        return {
          type: "text",
          value: `Sub-agent execution completed but analysis failed. Raw result: ${output.slice(0, 200)}${output.length > 200 ? "..." : ""}`,
        };
      }
    },
    async execute(input) {
      const toolValues = Array.isArray(input.tool) ? input.tool : [input.tool];

      const requestedToolkits = Array.from(
        new Set(
          toolValues
            .map((rawValue) => rawValue.trim())
            .filter((value) => value.length > 0)
            .map((value) => value.toUpperCase()),
        ),
      );

      if (requestedToolkits.length === 0) {
        throw new Error("At least one connector toolkit must be specified.");
      }

      if (!userId) {
        throw new Error("User session required to use connectors.");
      }

      const availableSet = new Set(availableToolkits.map((slug) => slug.toUpperCase()));
      const unavailable = requestedToolkits.filter((slug) => !availableSet.has(slug));

      if (unavailable.length > 0) {
        throw new Error(
          `Unavailable connectors requested: ${unavailable.join(", ")}. Enable them in settings and try again.`,
        );
      }

      const filteredTools = await getComposioTools(userId, requestedToolkits);

      if (Object.keys(filteredTools).length === 0) {
        throw new Error("No connector tools available for the requested selection.");
      }

      const innerSystem = appendComposioToolRouterInstructions(
        systemPrompt ?? buildInnerSystemPrompt(input.task, requestedToolkits, connectorsStatus),
      );

      // Build messages array based on whether context is provided
      const messages: UIMessage[] = [];

      // Add context message if provided
      if (input.context) {
        messages.push({
          id: "create-agent-context",
          role: "user",
          parts: [
            {
              type: "text",
              text: `Context from previous operations:\n\n${input.context}`,
            },
          ],
        });
      }

      // Add task message
      messages.push({
        id: "create-agent-task",
        role: "user",
        parts: [{ type: "text", text: input.task }],
      });

      // Track sub-agent token usage and error state
      let agentTokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      let subAgentError: Error | null = null;

      // Stream the agent's work using standard AI SDK streaming
      const result = streamText({
        model,
        instructions: innerSystem,
        messages: await convertToModelMessages(messages),
        tools: filteredTools,
        stopWhen: isStepCount(maxSteps),
        providerOptions,
        // toolChoice: "required",
        onError: ({ error }) => {
          subAgentError = error instanceof Error ? error : new Error(String(error));
        },
        onEnd({ usage }) {
          agentTokenUsage = {
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            totalTokens: usage.totalTokens || 0,
          };
        },
      });

      // Generate unique boundary ID for this agent execution
      const boundaryId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Inject start boundary marker
      writer.write({
        type: "data-agent-boundary",
        id: `${boundaryId}-start`,
        data: {
          type: "start",
          agentId: "create_agent",
          boundaryId,
          timestamp: new Date().toISOString(),
          task: input.task,
          toolkits: requestedToolkits,
          context: input.context,
        },
        transient: false, // Keep in message history for boundary detection
      });

      // Let AI SDK handle all the streaming naturally
      writer.merge(toUIMessageStream({ stream: result.stream }));

      // Collect text output from the stream and get tool execution information
      let finalText = "";
      for await (const textPart of result.textStream) {
        finalText += textPart;
      }

      // Get tool execution information (these are Promises)
      const [steps, finishReason] = await Promise.all([result.steps, result.finishReason]);

      // Collect all tool calls from all steps (not just the last one)
      const toolCalls = steps.flatMap((step) => step.toolCalls || []);
      const toolResults = steps.flatMap((step) => step.toolResults || []);

      // Analyze what the sub-agent actually did
      const analysis = analyzeSubAgentExecution({
        toolCalls,
        toolResults,
        finishReason,
        finalText: finalText.trim(),
        subAgentError,
      });

      // Inject end boundary marker with analysis
      writer.write({
        type: "data-agent-boundary",
        id: `${boundaryId}-end`,
        data: {
          type: "end",
          agentId: "create_agent",
          boundaryId,
          timestamp: new Date().toISOString(),
          analysis,
          toolSummary: {
            toolsUsed: analysis.toolNames,
            toolCallCount: analysis.toolCallCount,
            finishReason: analysis.finishReason,
            success: analysis.success,
          },
          tokenUsage: agentTokenUsage,
        },
        transient: false, // Keep in message history for boundary detection
      });

      // Return structured analysis as JSON for toModelOutput processing
      return JSON.stringify(analysis);
    },
  });
};

import type { Tool, UIMessage, UIMessageStreamWriter } from "ai";
import {
  convertToModelMessages,
  generateId,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { z } from "zod";
import { getComposioTools } from "@/lib/composio-server";
import type { ConnectorStatusLists } from "@/lib/connector-utils";

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

export type CreateAgentInput = z.infer<typeof createAgentInputSchema> & {
  tool: string | string[];
};

type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

type CreateAgentToolOptions = {
  userId?: string;
  availableToolkits: string[];
  model: string;
  systemPrompt?: string;
  maxSteps?: number;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  connectorsStatus?: ConnectorStatusLists;
  writer: UIMessageStreamWriter;
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
    availableToolkits.length > 0
      ? availableToolkits.join(", ")
      : "(no connectors available)";

  return tool<CreateAgentInput, string>({
    description: `Create a temporary agent that can use specific connectors to complete a task. Provide the connectors via the \`tool\` field and the high-level goal via \`task\`. Available connectors: ${connectorListDescription}.`,
    inputSchema: createAgentInputSchema,
    async execute(input) {
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
        throw new Error("At least one connector toolkit must be specified.");
      }

      if (!userId) {
        throw new Error("User session required to use connectors.");
      }

      const availableSet = new Set(
        availableToolkits.map((slug) => slug.toUpperCase())
      );
      const unavailable = requestedToolkits.filter(
        (slug) => !availableSet.has(slug)
      );

      if (unavailable.length > 0) {
        throw new Error(
          `Unavailable connectors requested: ${unavailable.join(", ")}. Enable them in settings and try again.`
        );
      }

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

      if (Object.keys(filteredTools).length === 0) {
        throw new Error(
          "No connector tools available for the requested selection."
        );
      }

      const innerSystem =
        systemPrompt ??
        buildInnerSystemPrompt(input.task, requestedToolkits, connectorsStatus);

      const agentUserMessage: UIMessage = {
        id: "create-agent-task",
        role: "user",
        parts: [{ type: "text", text: input.task }],
      };

      const result = streamText({
        model,
        system: innerSystem,
        messages: convertToModelMessages([agentUserMessage]),
        tools: filteredTools,
        stopWhen: stepCountIs(maxSteps),
        providerOptions,
      });

      // Stream subagent execution as custom data parts for chain-of-thought visualization
      const agentId = generateId();
      let stepIndex = 0;

      // Start agent execution
      writer.write({
        type: "data-agent-start",
        id: `subagent-${agentId}`,
        data: {
          task: input.task,
          tool: requestedToolkits,
          agentId: `subagent-${agentId}`,
        },
      });

      // Stream subagent chunks as structured data parts
      (async () => {
        try {
          for await (const chunk of result.fullStream) {
            const stepId = `subagent-${agentId}-step-${stepIndex++}`;

            switch (chunk.type) {
              case "text-start":
                writer.write({
                  type: "data-agent-step",
                  id: stepId,
                  data: {
                    type: "text",
                    status: "start",
                    contentId: `subagent-${chunk.id}`,
                    stepId,
                  },
                });
                break;

              case "text-delta":
                writer.write({
                  type: "data-agent-step-update",
                  id: stepId,
                  data: {
                    type: "text",
                    delta: chunk.text,
                    contentId: `subagent-${chunk.id}`,
                    stepId,
                  },
                });
                break;

              case "text-end":
                writer.write({
                  type: "data-agent-step",
                  id: stepId,
                  data: {
                    type: "text",
                    status: "end",
                    contentId: `subagent-${chunk.id}`,
                    stepId,
                  },
                });
                break;

              case "tool-call":
                writer.write({
                  type: "data-agent-step",
                  id: stepId,
                  data: {
                    type: "tool",
                    status: "input-available",
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                    input: chunk.input,
                    stepId,
                  },
                });
                break;

              case "tool-result":
                writer.write({
                  type: "data-agent-step",
                  id: stepId,
                  data: {
                    type: "tool",
                    status: "output-available",
                    toolCallId: chunk.toolCallId,
                    toolName: chunk.toolName,
                    input: chunk.input,
                    output: chunk.output,
                    stepId,
                  },
                });
                break;

              case "reasoning-start":
                writer.write({
                  type: "data-agent-step",
                  id: stepId,
                  data: {
                    type: "reasoning",
                    status: "start",
                    contentId: `subagent-${chunk.id}`,
                    stepId,
                  },
                });
                break;

              case "reasoning-delta":
                writer.write({
                  type: "data-agent-step-update",
                  id: stepId,
                  data: {
                    type: "reasoning",
                    delta: chunk.text,
                    contentId: `subagent-${chunk.id}`,
                    stepId,
                  },
                });
                break;

              case "reasoning-end":
                writer.write({
                  type: "data-agent-step",
                  id: stepId,
                  data: {
                    type: "reasoning",
                    status: "end",
                    contentId: `subagent-${chunk.id}`,
                    stepId,
                  },
                });
                break;

              case "start-step":
                writer.write({
                  type: "data-agent-step",
                  id: stepId,
                  data: {
                    type: "step",
                    status: "start",
                    stepId,
                  },
                });
                break;

              case "finish-step":
                writer.write({
                  type: "data-agent-step",
                  id: stepId,
                  data: {
                    type: "step",
                    status: "finish",
                    stepId,
                  },
                });
                break;

              case "finish":
                // Handle finish in the main flow after await result.text
                break;

              default:
                // Log unknown chunk types for debugging
                break;
            }
          }
        } catch (error) {
          writer.write({
            type: "data-agent-error",
            id: `subagent-${agentId}`,
            data: {
              error: error instanceof Error ? error.message : "Unknown error",
              agentId: `subagent-${agentId}`,
            },
          });
        }
      })();

      const finalText = (await result.text).trim();

      // End agent execution
      writer.write({
        type: "data-agent-end",
        id: `subagent-${agentId}`,
        data: {
          result:
            finalText.length > 0
              ? finalText
              : "Delegated agent completed without additional commentary.",
          agentId: `subagent-${agentId}`,
        },
      });

      return finalText.length > 0
        ? finalText
        : "Delegated agent completed without additional commentary.";
    },
  });
};

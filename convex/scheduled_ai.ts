"use node";

import { Redis } from "@upstash/redis";
import type { Tool, UIMessage, UIMessageStreamWriter } from "ai";
import { ConvexError, v } from "convex/values";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

import { createScheduledAgent } from "../src/lib/ai/agent";
import {
  ScheduledAgentMemory,
  formatWorkingMemoryPrompt,
} from "../src/lib/ai/scheduled-agent-memory";
import { MODELS_MAP } from "../src/lib/config/models";
import { SCHEDULED_AGENT_MODEL_ID } from "../src/lib/config/models/minimax";
import { languageModelOf } from "../src/lib/config/schemas";
import type { ConnectorStatusLists } from "../src/lib/connector-utils";
import { createAgentTool } from "../src/lib/create-agent-tool";
import { limitDepth } from "../src/lib/depth-limiter";
import { ERROR_CODES, getErrorMessage } from "../src/lib/error-codes";
import { buildSystemPrompt } from "../src/lib/prompt-config";
import { createMeteredSearchTool } from "../src/lib/tools/search-credit-metering";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { CreditReceipt } from "./lib/credits";
import schema from "./schema";

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezonePlugin);

// Usage-limit errors that pause the task instead of failing the run
const PAUSING_LIMIT_ERRORS = new Set<string>([
  ERROR_CODES.PREMIUM_MODEL_ACCESS_DENIED,
  ERROR_CODES.DAILY_LIMIT_REACHED,
  ERROR_CODES.MONTHLY_LIMIT_REACHED,
  ERROR_CODES.PREMIUM_LIMIT_REACHED,
]);

// Generation is aborted this long after the run was claimed, so a slow run still fails inside the
// action (refunding its credit) instead of being killed at Convex's 10-minute limit for Node
// actions. A run starting later ends at once, so no run is still working 18 minutes after its
// claim, when scheduled_tasks:expireTaskExecution has yet to release the task.
const GENERATION_DEADLINE_MS = 8 * 60 * 1000;

// Connector types the scheduled agent can use (server-safe, without importing UI modules)
const SUPPORTED_CONNECTOR_TYPES = [
  "gmail",
  "googlecalendar",
  "googledrive",
  "notion",
  "googledocs",
  "googlesheets",
  "slack",
  "linear",
  "github",
  "twitter",
] as const;

// Reads the Upstash credentials the agent memory needs, throwing when either is missing
const getRedisCredentials = (): { url: string; token: string } => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url === undefined || url === "" || token === undefined || token === "") {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env vars"
    );
  }
  return { url, token };
};

type CreditCharge =
  | { status: "charged"; receipt: CreditReceipt | null }
  | { status: "paused"; errorMessage: string };

// Enforces subscription access and charges the run's credit (receipt is null for models that skip
// rate limiting). A usage limit returns "paused" instead of throwing; other errors are rethrown.
const chargeRunCredit = async (
  ctx: ActionCtx,
  userId: Id<"users">,
  model: {
    premium: boolean;
    usesPremiumCredits: boolean;
    skipRateLimit?: boolean;
  }
): Promise<CreditCharge> => {
  const creditArgs = {
    userId,
    requiresPremium: model.premium,
    usesPremiumCredits: model.usesPremiumCredits,
  };
  try {
    if (model.skipRateLimit === true) {
      await ctx.runMutation(
        internal.users.assertNotOverLimitInternal,
        creditArgs
      );
      return { status: "charged", receipt: null };
    }
    const receipt = await ctx.runMutation(
      internal.users.consumeMessageCreditInternal,
      creditArgs
    );
    return { status: "charged", receipt };
  } catch (error) {
    if (
      error instanceof ConvexError &&
      typeof error.data === "string" &&
      PAUSING_LIMIT_ERRORS.has(error.data)
    ) {
      return { status: "paused", errorMessage: getErrorMessage(error.data) };
    }
    throw error;
  }
};

// Loads the user's connectors as Composio toolkit slugs plus status lists for the prompt.
// Failures are logged and leave whatever was loaded so far (no tools when nothing loaded).
const loadConnectorsContext = async (
  ctx: ActionCtx,
  userId: Id<"users">
): Promise<{
  toolkitSlugs: string[];
  connectorsStatus: ConnectorStatusLists | undefined;
}> => {
  let toolkitSlugs: string[] = [];
  try {
    // Get user's connected connectors (Gmail, Google Calendar, Notion, etc.)
    const connectedConnectors = await ctx.runQuery(
      internal.connectors.getConnectedConnectors,
      { userId }
    );
    // Also get all connectors (including disabled) for status reporting
    const allUserConnectors = await ctx.runQuery(
      internal.connectors.getAllUserConnectors,
      { userId }
    );

    if (connectedConnectors.length > 0) {
      // Convert connector types to Composio toolkit slugs
      // e.g., 'gmail' -> 'GMAIL', 'googlecalendar' -> 'GOOGLECALENDAR'
      toolkitSlugs = connectedConnectors
        .filter((connector) => connector.enabled !== false)
        .map((connector) => connector.type.toUpperCase());
    }

    // Compute connectors status lists for prompt clarity
    const disabledSlugs = allUserConnectors
      .filter((c) => c.isConnected && c.enabled === false)
      .map((c) => c.type.toUpperCase());
    const presentTypes = new Set<string>(
      allUserConnectors.filter((c) => c.isConnected).map((c) => c.type)
    );
    const notConnectedSlugs = SUPPORTED_CONNECTOR_TYPES.filter(
      (t) => !presentTypes.has(t)
    ).map((t) => t.toUpperCase());

    return {
      toolkitSlugs,
      connectorsStatus: {
        enabled: toolkitSlugs,
        disabled: disabledSlugs,
        notConnected: notConnectedSlugs,
      },
    };
  } catch (error) {
    console.error("Failed to load Composio tools:", error);
    return { toolkitSlugs, connectorsStatus: undefined };
  }
};

// Token counts for a run's metadata; the agent result does not expose reasoning or cached tokens
const toRunUsage = (
  usage:
    | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
    | undefined
) => ({
  inputTokens: usage?.inputTokens ?? 0,
  outputTokens: usage?.outputTokens ?? 0,
  reasoningTokens: 0,
  totalTokens: usage?.totalTokens ?? 0,
  cachedInputTokens: 0,
});

// Performs one run of a scheduled task that is already claimed: scheduled right after the claim
// by scheduled_tasks:startScheduledRun (timed runs) and triggerScheduledTask (manual runs), with
// the claimed task and the executionId of its "running" history row.
export const executeTask = internalAction({
  args: {
    // lastExecuted is the claim time (set by scheduled_tasks.claimRun)
    task: schema.doc("scheduled_tasks").extend({ lastExecuted: v.number() }),
    executionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { task, executionId }) => {
    const startTime = Date.now();
    const generationDeadline = task.lastExecuted + GENERATION_DEADLINE_MS;
    let chatId: Id<"chats"> | undefined;
    // Receipt of the charged credit; refunded only if the run fails before the model finishes
    // generating
    let chargedCredit: CreditReceipt | null = null;
    let generated = false;
    // Every path must end here (or the claim expires as "timeout")
    const finish = async (
      outcome: "success" | "failure" | "paused",
      details: {
        errorMessage?: string;
        metadata?: Doc<"task_history">["metadata"];
      } = {}
    ): Promise<null> =>
      await ctx.runMutation(internal.scheduled_tasks.finishTaskExecution, {
        taskId: task._id,
        executionId,
        outcome,
        chatId,
        ...details,
      });

    // Started too late (the action queue lagged): no generation time is left, and running on could
    // outlive the claim, so end the run before charging a credit, creating a chat, or calling tools
    if (startTime >= generationDeadline) {
      return await finish("failure", {
        errorMessage: "The run could not start in time.",
      });
    }

    try {
      // Validate memory backend config before creating the chat
      const redisCredentials = getRedisCredentials();

      // Get user details
      const user: Doc<"users"> | null = await ctx.runQuery(
        internal.users.getUser,
        {
          userId: task.userId,
        }
      );
      if (!user) {
        throw new Error("User not found");
      }

      // Get profile if assigned (validate ownership to prevent cross-user data leakage)
      const fetchedProfile = task.profileId
        ? await ctx.runQuery(internal.profiles.getProfileInternal, {
            profileId: task.profileId,
          })
        : null;
      const profile =
        fetchedProfile?.userId === task.userId ? fetchedProfile : null;

      if (!Object.hasOwn(MODELS_MAP, SCHEDULED_AGENT_MODEL_ID)) {
        throw new Error(
          `Scheduled agent model ${SCHEDULED_AGENT_MODEL_ID} is not configured`
        );
      }
      const selectedModel = MODELS_MAP[SCHEDULED_AGENT_MODEL_ID];
      const languageModel = languageModelOf(selectedModel);

      // Enforce subscription access and charge the credit up front, before creating the chat,
      // so concurrent runs cannot overspend. A usage limit pauses the task instead of failing it.
      const charge = await chargeRunCredit(ctx, task.userId, selectedModel);
      if (charge.status === "paused") {
        await finish("paused", { errorMessage: charge.errorMessage });
        return null;
      }
      chargedCredit = charge.receipt;

      // Create a new chat for each task execution, titled with the run time in the user's zone
      const executionDate = dayjs()
        .tz(task.timezone)
        .format("YYYY-MM-DD HH:mm");
      const chat = await ctx.runMutation(internal.chats.createChatInternal, {
        userId: task.userId,
        title: `${task.title} - ${executionDate}`,
        model: SCHEDULED_AGENT_MODEL_ID,
        profileId: profile?._id,
      });
      ({ chatId } = chat);

      // Point the task at the latest chat
      await ctx.runMutation(internal.scheduled_tasks.updateTaskChatId, {
        taskId: task._id,
        chatId,
      });

      // Get Composio tools from user's connected services
      // We use connectors table instead of task.enabledToolSlugs because:
      // 1. The enabledToolSlugs field is not yet implemented in the UI
      // 2. Connectors table tracks actual user connections to external services
      // 3. This ensures only connected services are available as tools
      const { toolkitSlugs, connectorsStatus } = await loadConnectorsContext(
        ctx,
        task.userId
      );

      // Build system prompt
      const systemPrompt = buildSystemPrompt(
        user,
        // No persona for scheduled tasks
        undefined,
        task.enableSearch,
        toolkitSlugs.length > 0,
        task.timezone,
        // Enable email mode when notifications are enabled
        task.emailNotifications,
        // Enable task mode for autonomous execution
        true,
        connectorsStatus,
        profile
      );

      // console.log('Selected model:', selectedModel);

      // Save user message
      const { messageId: userMsgId } = await ctx.runMutation(
        internal.messages.sendUserMessageToChatInternal,
        {
          chatId,
          role: "user",
          content: task.prompt,
          parts: [{ type: "text", text: task.prompt }],
          metadata: {},
        }
      );

      // Execute AI request using Agent from ai-sdk-tools
      const aiStartTime = Date.now();

      // Pre-build base metadata before streaming (same as chat route)
      const baseMetadata = {
        modelId: selectedModel.id,
        modelName: selectedModel.name,
        includeSearch: task.enableSearch,
      };

      const toolset: Record<string, Tool> = {};

      const meteredSearchTool = createMeteredSearchTool({
        enableSearch: Boolean(task.enableSearch),
        consumeStandardCredits: async (count) => {
          await ctx.runMutation(
            internal.users.incrementStandardCreditsInternal,
            {
              userId: task.userId,
              count,
            }
          );
        },
      });

      if (meteredSearchTool) {
        toolset.search = meteredSearchTool;
      }

      if (toolkitSlugs.length > 0) {
        const noopWriter: UIMessageStreamWriter = {
          write: () => {
            // no-op writer for scheduled executions
          },
          merge: () => {
            // scheduled runs do not stream to a client
          },
          onError: undefined,
        };
        toolset.create_agent = createAgentTool({
          userId: task.userId,
          availableToolkits: toolkitSlugs,
          model: languageModel,
          connectorsStatus,
          writer: noopWriter,
        });
      }

      // Initialize memory
      const redis = new Redis(redisCredentials);
      const memory = new ScheduledAgentMemory(redis);

      // Load history + working memory
      const history = await memory.loadHistory(task._id, 20);
      const workingMem = await memory.loadWorkingMemory(task.userId);

      // Inject working memory instructions into system prompt
      const enhancedPrompt = `${systemPrompt}\n\n${formatWorkingMemoryPrompt(workingMem)}`;

      // Add updateWorkingMemory tool
      toolset.updateWorkingMemory = memory.createUpdateTool(task.userId);

      // Initialize Agent
      const agent = createScheduledAgent({
        model: languageModel,
        systemPrompt: enhancedPrompt,
        tools: toolset,
      });

      // Execute Agent
      const result = await agent.generate({
        messages: [...history, { role: "user" as const, content: task.prompt }],
        timeout: Math.max(0, generationDeadline - Date.now()),
      });

      generated = true;
      const textContent = result.text;

      // Save history after generation (best-effort only)
      try {
        await memory.saveHistory(task._id, task.prompt, textContent);
      } catch (error) {
        console.error("Failed to save history to Redis:", error);
      }

      // The agent result's `usage` has inputTokens, outputTokens and totalTokens
      const finalUsage = toRunUsage(result.usage);

      // Construct email content from the generated assistant text
      const emailTextContent = textContent;

      // Construct final metadata
      const finalMetadata = {
        ...baseMetadata,
        serverDurationMs: Date.now() - aiStartTime,
        inputTokens: finalUsage.inputTokens,
        outputTokens: finalUsage.outputTokens,
        totalTokens: finalUsage.totalTokens,
        reasoningTokens: finalUsage.reasoningTokens,
        cachedInputTokens: finalUsage.cachedInputTokens,
      };

      // Construct UI-compatible parts for the final message
      // Since Agent abstracts steps, we only save the final response to Convex
      const assistantParts: NonNullable<UIMessage["parts"]> = [
        { type: "text", text: textContent },
      ];

      // Limit depth of parts to prevent Convex nesting limit errors
      const depthLimitedParts = limitDepth(assistantParts, 14);

      // Send email notification after message processing is complete
      if (task.emailNotifications === true && emailTextContent !== "") {
        // Schedule email mutation to run immediately after this action completes
        await ctx.scheduler.runAfter(0, internal.email.sendTaskSummaryEmail, {
          userId: task.userId,
          taskId: task._id,
          taskTitle: task.title,
          taskContent: emailTextContent,
          executionDate,
          chatId,
        });
      }

      // Save assistant message with UI-compatible parts
      await ctx.runMutation(internal.messages.saveAssistantMessageInternal, {
        chatId,
        role: "assistant",
        content: textContent,
        parentMessageId: userMsgId,
        parts: depthLimitedParts,
        metadata: finalMetadata,
      });

      await finish("success", {
        metadata: {
          modelId: selectedModel.id,
          modelName: selectedModel.name,
          inputTokens: finalUsage.inputTokens,
          outputTokens: finalUsage.outputTokens,
          totalTokens: finalUsage.totalTokens,
          reasoningTokens: finalUsage.reasoningTokens,
          cachedInputTokens: finalUsage.cachedInputTokens,
          serverDurationMs: Date.now() - startTime,
          includeSearch: task.enableSearch,
          toolkitSlugs,
        },
      });
      return null;
    } catch (error) {
      // Refund only failed generations; a failure after generating (e.g. the chat was deleted
      // mid-run) keeps the charge, matching the chat route.
      if (chargedCredit && !generated) {
        await ctx
          .runMutation(internal.users.refundMessageCreditInternal, {
            userId: task.userId,
            receipt: chargedCredit,
          })
          .catch((refundError: unknown) => {
            console.error(
              "Failed to refund scheduled task credit:",
              refundError
            );
          });
      }
      // One-time tasks are archived; recurring tasks keep the next run booked at claim time
      await finish("failure", {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  },
});

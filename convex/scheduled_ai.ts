"use node";

import type { Tool, UIMessage, UIMessageStreamWriter } from "ai";
import { Redis } from "@upstash/redis";
import {
  ScheduledAgentMemory,
  formatWorkingMemoryPrompt,
} from "../src/lib/ai/scheduled-agent-memory";
import { ConvexError, v } from "convex/values";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { createScheduledAgent } from "../src/lib/ai/agent";
import { MODELS_MAP } from "../src/lib/config";
import { SCHEDULED_AGENT_MODEL_ID } from "../src/lib/config/models/minimax";
import type { ConnectorStatusLists } from "../src/lib/connector-utils";
import { createAgentTool } from "../src/lib/create-agent-tool";
import { limitDepth } from "../src/lib/depth-limiter";
import { ERROR_CODES, type ErrorCode, getErrorMessage } from "../src/lib/error-codes";
import { buildSystemPrompt } from "../src/lib/prompt_config";
import { createMeteredSearchTool } from "../src/lib/tools/search-credit-metering";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

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

// Execute a scheduled task. Scheduled by create/update/resume and by claimTaskExecution (recurring
// runs), and with isManualTrigger by triggerScheduledTask. Keep the args shape: jobs that are
// already scheduled call it with { taskId } or { taskId, isManualTrigger }.
export const executeTask = internalAction({
  args: {
    taskId: v.id("scheduled_tasks"),
    isManualTrigger: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Generate unique execution ID
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    // Atomically claim the run; this also books the next occurrence of a recurring task
    const task: Doc<"scheduled_tasks"> | null = await ctx.runMutation(
      internal.scheduled_tasks.claimTaskExecution,
      { taskId: args.taskId, executionId, isManualTrigger: args.isManualTrigger },
    );
    if (!task) {
      return null;
    }

    const startTime = Date.now();
    let chatId: Id<"chats"> | undefined;
    // Every path after a successful claim must end here (or the claim expires as "timeout")
    const finish = async (
      outcome: "success" | "failure" | "paused",
      details: { errorMessage?: string; metadata?: Doc<"task_history">["metadata"] } = {},
    ): Promise<null> =>
      await ctx.runMutation(internal.scheduled_tasks.finishTaskExecution, {
        taskId: args.taskId,
        executionId,
        outcome,
        chatId,
        ...details,
      });

    try {
      // Validate memory backend config before creating the chat
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (!redisUrl || !redisToken) {
        throw new Error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env vars");
      }

      // Get user details
      const user: Doc<"users"> | null = await ctx.runQuery(internal.users.getUser, {
        userId: task.userId,
      });
      if (!user) {
        throw new Error("User not found");
      }

      // Get profile if assigned (validate ownership to prevent cross-user data leakage)
      const fetchedProfile = task.profileId
        ? await ctx.runQuery(internal.profiles.getProfileInternal, { profileId: task.profileId })
        : null;
      const profile = fetchedProfile?.userId === task.userId ? fetchedProfile : null;

      const selectedModel = MODELS_MAP[SCHEDULED_AGENT_MODEL_ID];
      if (!selectedModel) {
        throw new Error(`Scheduled agent model ${SCHEDULED_AGENT_MODEL_ID} is not configured`);
      }

      // Enforce subscription access and rate limits before creating the chat; a usage limit
      // pauses the task instead of failing the run.
      try {
        await ctx.runMutation(internal.users.assertNotOverLimitInternal, {
          userId: task.userId,
          requiresPremium: selectedModel.premium === true,
          usesPremiumCredits: selectedModel.usesPremiumCredits === true,
        });
      } catch (error) {
        if (
          error instanceof ConvexError &&
          typeof error.data === "string" &&
          PAUSING_LIMIT_ERRORS.has(error.data)
        ) {
          await finish("paused", { errorMessage: getErrorMessage(error.data as ErrorCode) });
          return null;
        }
        throw error;
      }

      // Create a new chat for each task execution, titled with the run time in the user's zone
      const executionDate = dayjs().tz(task.timezone).format("YYYY-MM-DD HH:mm");
      const chat = await ctx.runMutation(internal.chats.createChatInternal, {
        userId: task.userId,
        title: `${task.title} - ${executionDate}`,
        model: SCHEDULED_AGENT_MODEL_ID,
        profileId: profile?._id,
      });
      chatId = chat.chatId;

      // Point the task at the latest chat
      await ctx.runMutation(internal.scheduled_tasks.updateTaskChatId, {
        taskId: args.taskId,
        chatId,
      });

      // Get Composio tools from user's connected services
      // We use connectors table instead of task.enabledToolSlugs because:
      // 1. The enabledToolSlugs field is not yet implemented in the UI
      // 2. Connectors table tracks actual user connections to external services
      // 3. This ensures only connected services are available as tools
      let toolkitSlugs: string[] = [];
      let connectorsStatus: ConnectorStatusLists | undefined;
      try {
        // Get user's connected connectors (Gmail, Google Calendar, Notion, etc.)
        const connectedConnectors = await ctx.runQuery(internal.connectors.getConnectedConnectors, {
          userId: task.userId,
        });
        // Also get all connectors (including disabled) for status reporting
        const allUserConnectors = await ctx.runQuery(internal.connectors.getAllUserConnectors, {
          userId: task.userId,
        });

        // console.log('Connected connectors:', connectedConnectors);

        if (connectedConnectors.length > 0) {
          // Convert connector types to Composio toolkit slugs
          // e.g., 'gmail' -> 'GMAIL', 'googlecalendar' -> 'GOOGLECALENDAR'
          toolkitSlugs = connectedConnectors
            .filter((connector) => connector.enabled !== false)
            .map((connector) => connector.type.toUpperCase());
          // console.log('Derived toolkit slugs:', toolkitSlugs);
        }

        // Compute connectors status lists for prompt clarity
        const enabledSlugs = toolkitSlugs;
        const disabledSlugs = allUserConnectors
          .filter((c) => c.isConnected && c.enabled === false)
          .map((c) => c.type.toUpperCase());
        const presentTypes = new Set(
          allUserConnectors.filter((c) => c.isConnected).map((c) => c.type),
        );
        // Supported types (server-safe, without importing UI modules)
        const SUPPORTED_TYPES = [
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
        const notConnectedSlugs = SUPPORTED_TYPES.filter((t) => !presentTypes.has(t)).map((t) =>
          t.toUpperCase(),
        );

        connectorsStatus = {
          enabled: enabledSlugs,
          disabled: disabledSlugs,
          notConnected: notConnectedSlugs,
        };
      } catch (error) {
        console.error("Failed to load Composio tools:", error);
      }

      // Build system prompt
      const systemPrompt = buildSystemPrompt(
        user,
        undefined, // No persona for scheduled tasks
        task.enableSearch,
        toolkitSlugs.length > 0,
        task.timezone,
        task.emailNotifications, // Enable email mode when notifications are enabled
        true, // Enable task mode for autonomous execution
        connectorsStatus,
        profile,
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
        },
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
          await ctx.runMutation(internal.users.incrementStandardCreditsInternal, {
            userId: task.userId,
            count,
          });
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
          model: selectedModel.api_sdk,
          connectorsStatus,
          writer: noopWriter,
        });
      }

      // Initialize memory
      const redis = new Redis({
        url: redisUrl,
        token: redisToken,
      });
      const memory = new ScheduledAgentMemory(redis);

      // Load history + working memory
      const history = await memory.loadHistory(args.taskId, 20);
      const workingMem = await memory.loadWorkingMemory(task.userId);

      // Inject working memory instructions into system prompt
      const enhancedPrompt = `${systemPrompt}\n\n${formatWorkingMemoryPrompt(workingMem)}`;

      // Add updateWorkingMemory tool
      toolset.updateWorkingMemory = memory.createUpdateTool(task.userId);

      // Initialize Agent
      const agent = createScheduledAgent({
        model: selectedModel.api_sdk,
        systemPrompt: enhancedPrompt,
        tools: toolset,
      });

      // Execute Agent
      const result = await agent.generate({
        messages: [...history, { role: "user" as const, content: task.prompt }],
      });

      const textContent = result.text;

      // Save history after generation (best-effort only)
      try {
        await memory.saveHistory(args.taskId, task.prompt, textContent);
      } catch (error) {
        console.error("Failed to save history to Redis:", error);
      }

      // Agent result usage might be structured differently, mapping it:
      // ai-sdk-tools agent result has `usage` property with inputTokens, outputTokens
      const finalUsage = {
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0,
        reasoningTokens: 0, // Agent might not expose this directly yet, defaulting to 0
        totalTokens: result.usage?.totalTokens || 0,
        cachedInputTokens: 0,
      };

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
      const assistantParts: NonNullable<UIMessage["parts"]> = [{ type: "text", text: textContent }];

      // Limit depth of parts to prevent Convex nesting limit errors
      const depthLimitedParts = limitDepth(assistantParts, 14);

      // Send email notification after message processing is complete
      if (task.emailNotifications && emailTextContent) {
        // Schedule email mutation to run immediately after this action completes
        await ctx.scheduler.runAfter(0, internal.email.sendTaskSummaryEmail, {
          userId: task.userId,
          taskId: args.taskId,
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

      // --- Usage Tracking (same as chat route) ---
      // Only increment credits if model doesn't skip rate limiting
      if (!selectedModel.skipRateLimit) {
        // Check if the selected model uses premium credits
        const usesPremiumCredits = selectedModel.usesPremiumCredits === true;

        await ctx.runMutation(internal.users.incrementMessageCountInternal, {
          userId: task.userId,
          usesPremiumCredits,
        });
      }

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
      // One-time tasks are archived; recurring tasks keep the next run booked at claim time
      await finish("failure", {
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  },
});

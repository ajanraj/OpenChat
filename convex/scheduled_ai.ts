"use node";

import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import {
  consumeStream,
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { ConvexError, v } from "convex/values";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { searchTool } from "@/app/api/tools/search";
import { getComposioTools } from "@/lib/composio-server";
import { MODELS_MAP } from "@/lib/config";
import type { ConnectorStatusLists } from "@/lib/connector-utils";
import { limitDepth } from "@/lib/depth-limiter";
import { ERROR_CODES } from "@/lib/error-codes";
import { buildSystemPrompt } from "@/lib/prompt_config";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezonePlugin);

// Execute a scheduled task
export const executeTask = internalAction({
  args: {
    taskId: v.id("scheduled_tasks"),
    isManualTrigger: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Generate unique execution ID
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const startTime = Date.now();
    let historyRecordId: string | null = null;

    try {
      // Get task details
      // console.log('Executing scheduled task:', args.taskId);
      const task: Doc<"scheduled_tasks"> | null = await ctx.runQuery(
        internal.scheduled_tasks.getTask,
        { taskId: args.taskId }
      );

      if (!task) {
        // console.log('Task not found:', args.taskId);
        return null;
      }

      if (task.status !== "active") {
        // console.log('Task is not active:', args.taskId);
        return null;
      }

      // Get user details
      const user: Doc<"users"> | null = await ctx.runQuery(
        internal.users.getUser,
        { userId: task.userId }
      );

      if (!user) {
        // console.log('User not found for task:', args.taskId);
        return null;
      }

      // Create execution history record (after all validations pass)
      historyRecordId = await ctx.runMutation(
        internal.task_history.createExecutionHistory,
        {
          taskId: args.taskId,
          executionId,
          startTime,
          isManualTrigger: args.isManualTrigger,
        }
      );

      // Create a new chat for each task execution
      const currentDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
      const currentTime = new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });

      const { chatId } = await ctx.runMutation(
        internal.chats.createChatInternal,
        {
          userId: task.userId,
          title: `${task.title} - ${currentDate} ${currentTime}`,
          model: "gpt-5-mini",
        }
      );

      // Update task with the latest chat ID and set status to 'running'
      await ctx.runMutation(internal.scheduled_tasks.updateTaskChatId, {
        taskId: args.taskId,
        chatId,
      });

      // Set status to 'running' to indicate task is executing
      await ctx.runMutation(internal.scheduled_tasks.updateTaskAfterExecution, {
        taskId: args.taskId,
        lastExecuted: Date.now(),
        newStatus: "running",
      });

      // Get Composio tools from user's connected services
      // We use connectors table instead of task.enabledToolSlugs because:
      // 1. The enabledToolSlugs field is not yet implemented in the UI
      // 2. Connectors table tracks actual user connections to external services
      // 3. This ensures only connected services are available as tools
      let composioTools = {};
      let toolkitSlugs: string[] = [];
      let connectorsStatus: ConnectorStatusLists | undefined;
      try {
        // Get user's connected connectors (Gmail, Google Calendar, Notion, etc.)
        const connectedConnectors = await ctx.runQuery(
          internal.connectors.getConnectedConnectors,
          { userId: task.userId }
        );
        // Also get all connectors (including disabled) for status reporting
        const allUserConnectors = await ctx.runQuery(
          internal.connectors.getAllUserConnectors,
          { userId: task.userId }
        );

        // console.log('Connected connectors:', connectedConnectors);

        if (connectedConnectors.length > 0) {
          // Convert connector types to Composio toolkit slugs
          // e.g., 'gmail' -> 'GMAIL', 'googlecalendar' -> 'GOOGLECALENDAR'
          toolkitSlugs = connectedConnectors
            .filter((connector) => connector.enabled !== false)
            .map((connector) => connector.type.toUpperCase());
          // console.log('Derived toolkit slugs:', toolkitSlugs);
          composioTools = await getComposioTools(task.userId, toolkitSlugs);

          // console.log(composioTools);

          // Log the number of tools selected for monitoring
          const toolCount = Object.keys(composioTools).length;
          if (toolCount > 0) {
            // console.log(
            //   `Semantic search selected ${toolCount} relevant tools from ${toolkitSlugs.join(', ')} for task: "${task.title}"`
            // );
          }
        }

        // Compute connectors status lists for prompt clarity
        const enabledSlugs = toolkitSlugs;
        const disabledSlugs = allUserConnectors
          .filter((c) => c.isConnected && c.enabled === false)
          .map((c) => c.type.toUpperCase());
        const presentTypes = new Set(
          allUserConnectors.filter((c) => c.isConnected).map((c) => c.type)
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
        const notConnectedSlugs = SUPPORTED_TYPES.filter(
          (t) => !presentTypes.has(t)
        ).map((t) => t.toUpperCase());

        connectorsStatus = {
          enabled: enabledSlugs,
          disabled: disabledSlugs,
          notConnected: notConnectedSlugs,
        };
      } catch (_error) {
        // console.error('Failed to load Composio tools:', error);
        // Continue without Composio tools
      }

      // Build system prompt
      const systemPrompt = buildSystemPrompt(
        user,
        undefined, // No persona for scheduled tasks
        task.enableSearch,
        Object.keys(composioTools).length > 0,
        task.timezone,
        task.emailNotifications, // Enable email mode when notifications are enabled
        true, // Enable task mode for autonomous execution
        connectorsStatus
      );

      // Get GPT-5 Mini model
      const selectedModel = MODELS_MAP["gpt-5-mini"];
      if (!selectedModel) {
        // console.log('GPT-5 Mini model not found');
        return null;
      }

      // --- Rate Limiting Check (same as chat route) ---
      try {
        // Check if the selected model uses premium credits
        const usesPremiumCredits = selectedModel.usesPremiumCredits === true;

        await ctx.runMutation(internal.users.assertNotOverLimitInternal, {
          userId: task.userId,
          usesPremiumCredits,
        });
      } catch (error) {
        if (error instanceof ConvexError) {
          const errorCode = error.data;
          if (
            errorCode === ERROR_CODES.DAILY_LIMIT_REACHED ||
            errorCode === ERROR_CODES.MONTHLY_LIMIT_REACHED ||
            errorCode === ERROR_CODES.PREMIUM_LIMIT_REACHED
          ) {
            // Rate limit reached - pause the task (don't reschedule)
            await ctx.runMutation(
              internal.scheduled_tasks.updateTaskAfterExecution,
              {
                taskId: args.taskId,
                lastExecuted: Date.now(),
                newStatus: "paused",
              }
            );
            return null;
          }
        }
        // Re-throw non-rate-limit errors
        throw error;
      }

      // console.log('Selected model:', selectedModel);
      // Create user message
      const userMessage: UIMessage = {
        id: Math.random().toString(36).substring(2, 15),
        role: "user",
        parts: [{ type: "text", text: task.prompt }],
      };

      // console.log('User message:', userMessage);

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

      // Execute AI request using streamText (same pattern as chat route)
      const aiStartTime = Date.now();

      // Pre-build base metadata before streaming (same as chat route)
      const baseMetadata = {
        modelId: selectedModel.id,
        modelName: selectedModel.name,
        includeSearch: task.enableSearch,
        reasoningEffort: "medium" as const,
      };

      // Initialize usage tracking (same as chat route)
      let finalUsage = {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
      };

      const result = streamText({
        model: selectedModel.api_sdk,
        system: systemPrompt,
        messages: convertToModelMessages([userMessage]),
        toolChoice: "auto",
        tools: {
          ...(task.enableSearch ? { search: searchTool } : {}),
          ...composioTools,
        },
        stopWhen: stepCountIs(10),
        providerOptions: {
          openai: {
            textVerbosity: "low",
            reasoningEffort: "medium",
            reasoningSummary: "detailed",
          } satisfies OpenAIResponsesProviderOptions,
        },
        onFinish({ usage }) {
          // Capture usage data (runs on successful completion) - same as chat route
          finalUsage = {
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            reasoningTokens: usage.reasoningTokens || 0,
            totalTokens: usage.totalTokens || 0,
            cachedInputTokens: usage.cachedInputTokens || 0,
          };
        },
      });

      // Consume the stream to ensure it runs to completion (same as chat route)
      await result.consumeStream();

      // Variable to store email content outside the callback
      let emailTextContent = "";

      // Get UI-compatible parts using toUIMessageStreamResponse (same as chat route)
      // Create a promise that resolves when onFinish completes
      await new Promise<void>((resolve, reject) => {
        result.toUIMessageStreamResponse({
          originalMessages: [userMessage],
          sendReasoning: true,
          sendSources: true,
          onFinish: async (Messages) => {
            try {
              // Construct final metadata (same as chat route)
              const finalMetadata = {
                ...baseMetadata,
                serverDurationMs: Date.now() - aiStartTime,
                inputTokens: finalUsage.inputTokens,
                outputTokens: finalUsage.outputTokens,
                totalTokens: finalUsage.totalTokens,
                reasoningTokens: finalUsage.reasoningTokens,
                cachedInputTokens: finalUsage.cachedInputTokens,
              };

              // Extract text content for the content field (for search indexing)
              const textContent = Messages.responseMessage.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("");

              // Extract email content (last text part only)
              const textParts = Messages.responseMessage.parts.filter(
                (part) => part.type === "text"
              );
              emailTextContent =
                textParts.length > 0 ? textParts.at(-1)?.text || "" : "";

              // Limit depth of parts to prevent Convex nesting limit errors
              const depthLimitedParts = limitDepth(
                Messages.responseMessage.parts,
                14
              );

              // Send email notification after message processing is complete
              if (task.emailNotifications && emailTextContent) {
                const executionDate = `${currentDate} ${currentTime}`;
                // Schedule email mutation to run immediately after this action completes
                await ctx.scheduler.runAfter(
                  0,
                  internal.email.sendTaskSummaryEmail,
                  {
                    userId: task.userId,
                    taskId: args.taskId,
                    taskTitle: task.title,
                    taskContent: emailTextContent,
                    executionDate,
                    chatId,
                  }
                );
              }

              // Save assistant message with UI-compatible parts
              await ctx.runMutation(
                internal.messages.saveAssistantMessageInternal,
                {
                  chatId,
                  role: "assistant",
                  content: textContent,
                  parentMessageId: userMsgId,
                  parts: depthLimitedParts,
                  metadata: finalMetadata,
                }
              );

              // --- Usage Tracking (same as chat route) ---
              // Only increment credits if model doesn't skip rate limiting
              if (!selectedModel.skipRateLimit) {
                // Check if the selected model uses premium credits
                const usesPremiumCredits =
                  selectedModel.usesPremiumCredits === true;

                await ctx.runMutation(
                  internal.users.incrementMessageCountInternal,
                  {
                    userId: task.userId,
                    usesPremiumCredits,
                  }
                );
              }

              // Resolve the promise to signal completion
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          consumeSseStream: consumeStream,
        });
      });

      // Handle rescheduling based on task type
      const now = Date.now();

      if (task.scheduleType === "onetime") {
        // One-time task - mark as archived (completed)
        await ctx.runMutation(
          internal.scheduled_tasks.updateTaskAfterExecution,
          {
            taskId: args.taskId,
            lastExecuted: now,
            newStatus: "archived",
          }
        );
      } else if (args.isManualTrigger) {
        // Manual trigger for recurring task - execute normally but don't reschedule
        await ctx.runMutation(
          internal.scheduled_tasks.updateTaskAfterExecution,
          {
            taskId: args.taskId,
            lastExecuted: now,
            newStatus: "active", // Reset to active but don't schedule next execution
          }
        );
      } else {
        // Recurring task (daily or weekly) - calculate next execution
        // We need to parse the original scheduled time to maintain consistent timing
        let nextExecution: number;

        if (task.scheduleType === "daily") {
          // Parse the scheduled time (HH:MM) and calculate next occurrence
          const [hours, minutes] = task.scheduledTime.split(":").map(Number);

          // Create a date in the user's timezone
          const nowInUserTz = new Date();
          const userDate = new Date(
            nowInUserTz.getFullYear(),
            nowInUserTz.getMonth(),
            nowInUserTz.getDate(),
            hours,
            minutes,
            0,
            0
          );

          // Convert from user timezone to UTC
          let utcDate = dayjs.tz(userDate, task.timezone).utc().toDate();

          // Keep adding days until we find the next future occurrence
          while (utcDate.getTime() <= now) {
            userDate.setDate(userDate.getDate() + 1);
            utcDate = dayjs.tz(userDate, task.timezone).utc().toDate();
          }

          nextExecution = utcDate.getTime();
        } else {
          // Weekly - parse day:HH:MM
          const parts = task.scheduledTime.split(":");
          const targetDay = Number.parseInt(parts[0], 10);
          const hours = Number.parseInt(parts[1], 10);
          const minutes = Number.parseInt(parts[2], 10);

          // Create a date in the user's timezone
          const nowInUserTz = new Date();
          const currentDay = nowInUserTz.getDay();
          const daysToTarget = (targetDay - currentDay + 7) % 7;

          const userDate = new Date(
            nowInUserTz.getFullYear(),
            nowInUserTz.getMonth(),
            nowInUserTz.getDate() + daysToTarget,
            hours,
            minutes,
            0,
            0
          );

          // Convert from user timezone to UTC
          let utcDate = dayjs.tz(userDate, task.timezone).utc().toDate();

          // If this week's occurrence is in the past, add 7 days
          if (utcDate.getTime() <= now) {
            userDate.setDate(userDate.getDate() + 7);
            utcDate = dayjs.tz(userDate, task.timezone).utc().toDate();
          }

          nextExecution = utcDate.getTime();
        }

        const scheduledFunctionId = await ctx.scheduler.runAt(
          nextExecution,
          internal.scheduled_ai.executeTask,
          { taskId: args.taskId }
        );

        await ctx.runMutation(
          internal.scheduled_tasks.updateTaskAfterExecution,
          {
            taskId: args.taskId,
            lastExecuted: now,
            nextExecution,
            scheduledFunctionId,
            newStatus: "active", // Reset to active for next scheduled execution
          }
        );
      }

      // Update execution history with success
      if (historyRecordId) {
        await ctx.runMutation(internal.task_history.updateExecutionHistory, {
          executionId,
          status: "success",
          endTime: Date.now(),
          chatId,
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
      }

      // Clean up old execution history (keep last 30)
      await ctx.runMutation(internal.task_history.cleanupOldExecutions, {
        taskId: args.taskId,
        keepCount: 30,
      });

      return null;
    } catch (error) {
      // console.log('Error executing scheduled task:', error);

      // Update execution history with failure
      if (historyRecordId) {
        await ctx.runMutation(internal.task_history.updateExecutionHistory, {
          executionId,
          status: "failure",
          endTime: Date.now(),
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        });
      }

      // Update task to mark last execution attempt and reset status to active
      await ctx.runMutation(internal.scheduled_tasks.updateTaskAfterExecution, {
        taskId: args.taskId,
        lastExecuted: Date.now(),
        newStatus: "active", // Reset to active even on error for recurring tasks
      });

      return null;
    }
  },
});

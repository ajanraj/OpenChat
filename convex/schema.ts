import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Chat } from "./schema/chat";
import { ChatAttachment } from "./schema/chat_attachment";
import { Connector } from "./schema/connectors";
import { Feedback } from "./schema/feedback";
import { Message } from "./schema/message";
import { ScheduledTask } from "./schema/scheduled_task";
import { TaskHistory } from "./schema/task_history";
import { UsageHistory } from "./schema/usage_history";
// Import all schema modules
import { User } from "./schema/user";
import { UserApiKey } from "./schema/user_api_key";

export default defineSchema({
  ...authTables,
  users: defineTable(User).index("email", ["email"]),
  chats: defineTable(Chat).index("by_user", ["userId"]),
  messages: defineTable(Message)
    .index("by_chat_and_created", ["chatId", "createdAt"])
    .index("by_user", ["userId"])
    .searchIndex("by_user_content", {
      searchField: "content",
      filterFields: ["userId", "chatId"],
    }),
  feedback: defineTable(Feedback).index("by_user", ["userId"]),
  chat_attachments: defineTable(ChatAttachment)
    .index("by_chatId", ["chatId"])
    .index("by_userId", ["userId"])
    // Dedicated index for direct lookups/deletes by R2 object key
    .index("by_key", ["key"]),
  usage_history: defineTable(UsageHistory).index("by_user", ["userId"]),
  user_api_keys: defineTable(UserApiKey).index("by_user_provider", [
    "userId",
    "provider",
  ]),
  connectors: defineTable(Connector)
    .index("by_user", ["userId"])
    .index("by_user_and_type", ["userId", "type"])
    .index("by_user_and_connected", ["userId", "isConnected"]),
  scheduled_tasks: defineTable(ScheduledTask)
    .index("by_user", ["userId"])
    .index("by_user_and_type", ["userId", "scheduleType"])
    .index("by_next_execution", ["status", "nextExecution"]),
  task_history: defineTable(TaskHistory)
    .index("by_task", ["taskId"])
    .index("by_task_and_time", ["taskId", "startTime"])
    .index("by_status", ["status"])
    .index("by_execution_id", ["executionId"]),
});

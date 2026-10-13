import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { StripeCreditReset, StripeSubscriptionSync } from "./schema/billing";
import { Chat } from "./schema/chat";
import { ChatAttachment } from "./schema/chat_attachment";
import { Connector } from "./schema/connectors";
import { Feedback } from "./schema/feedback";
import { Message } from "./schema/message";
import { Profile } from "./schema/profile";
import { ScheduledTask } from "./schema/scheduled_task";
import { TaskHistory } from "./schema/task_history";
import { UsageHistory } from "./schema/usage_history";
// Import all schema modules
import { User } from "./schema/user";
import { UserApiKey } from "./schema/user_api_key";

export default defineSchema({
  ...authTables,
  users: defineTable(User).index("email", ["email"]),
  chats: defineTable(Chat)
    .index("by_user", ["userId"])
    // Chat list pages, most recently active first: one profile's, or every profile's (settings)
    .index("by_user_and_profile_and_updated", ["userId", "profileId", "updatedAt"])
    .index("by_user_and_updated", ["userId", "updatedAt"])
    .index("by_user_and_profile_and_pinned", ["userId", "profileId", "isPinned"])
    // Branches of a chat, to clear their link when the chat is deleted
    .index("by_user_and_original_chat", ["userId", "originalChatId"])
    .searchIndex("search_title", { searchField: "title", filterFields: ["userId", "profileId"] }),
  profiles: defineTable(Profile)
    .index("by_user", ["userId"])
    .index("by_user_and_default", ["userId", "isDefault"]),
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
  user_api_keys: defineTable(UserApiKey).index("by_user_provider", ["userId", "provider"]),
  connectors: defineTable(Connector)
    .index("by_user", ["userId"])
    .index("by_user_and_type", ["userId", "type"])
    .index("by_user_and_connected", ["userId", "isConnected"]),
  scheduled_tasks: defineTable(ScheduledTask)
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_profile", ["userId", "profileId"]),
  task_history: defineTable(TaskHistory)
    .index("by_task_and_time", ["taskId", "startTime"])
    .index("by_execution_id", ["executionId"]),
  stripe_subscription_syncs: defineTable(StripeSubscriptionSync).index(
    "by_stripe_subscription_id",
    ["stripeSubscriptionId"],
  ),
  stripe_credit_resets: defineTable(StripeCreditReset).index("by_stripe_invoice_id", [
    "stripeInvoiceId",
  ]),
});

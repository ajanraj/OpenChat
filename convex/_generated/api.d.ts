/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as api_keys from "../api_keys.js";
import type * as auth from "../auth.js";
import type * as chats from "../chats.js";
import type * as connectors from "../connectors.js";
import type * as email from "../email.js";
import type * as feedback from "../feedback.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as import_export from "../import_export.js";
import type * as lib_auth_helper from "../lib/auth_helper.js";
import type * as lib_cleanup_helper from "../lib/cleanup_helper.js";
import type * as lib_fileUploadModels from "../lib/fileUploadModels.js";
import type * as lib_rateLimitConstants from "../lib/rateLimitConstants.js";
import type * as lib_sanitization_helper from "../lib/sanitization_helper.js";
import type * as messages from "../messages.js";
import type * as polar from "../polar.js";
import type * as profiles from "../profiles.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as scheduled_ai from "../scheduled_ai.js";
import type * as scheduled_tasks from "../scheduled_tasks.js";
import type * as schema_chat from "../schema/chat.js";
import type * as schema_chat_attachment from "../schema/chat_attachment.js";
import type * as schema_connectors from "../schema/connectors.js";
import type * as schema_feedback from "../schema/feedback.js";
import type * as schema_message from "../schema/message.js";
import type * as schema_profile from "../schema/profile.js";
import type * as schema_scheduled_task from "../schema/scheduled_task.js";
import type * as schema_task_history from "../schema/task_history.js";
import type * as schema_usage_history from "../schema/usage_history.js";
import type * as schema_user from "../schema/user.js";
import type * as schema_user_api_key from "../schema/user_api_key.js";
import type * as subscription from "../subscription.js";
import type * as task_history from "../task_history.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  api_keys: typeof api_keys;
  auth: typeof auth;
  chats: typeof chats;
  connectors: typeof connectors;
  email: typeof email;
  feedback: typeof feedback;
  files: typeof files;
  http: typeof http;
  import_export: typeof import_export;
  "lib/auth_helper": typeof lib_auth_helper;
  "lib/cleanup_helper": typeof lib_cleanup_helper;
  "lib/fileUploadModels": typeof lib_fileUploadModels;
  "lib/rateLimitConstants": typeof lib_rateLimitConstants;
  "lib/sanitization_helper": typeof lib_sanitization_helper;
  messages: typeof messages;
  polar: typeof polar;
  profiles: typeof profiles;
  rateLimiter: typeof rateLimiter;
  scheduled_ai: typeof scheduled_ai;
  scheduled_tasks: typeof scheduled_tasks;
  "schema/chat": typeof schema_chat;
  "schema/chat_attachment": typeof schema_chat_attachment;
  "schema/connectors": typeof schema_connectors;
  "schema/feedback": typeof schema_feedback;
  "schema/message": typeof schema_message;
  "schema/profile": typeof schema_profile;
  "schema/scheduled_task": typeof schema_scheduled_task;
  "schema/task_history": typeof schema_task_history;
  "schema/usage_history": typeof schema_usage_history;
  "schema/user": typeof schema_user;
  "schema/user_api_key": typeof schema_user_api_key;
  subscription: typeof subscription;
  task_history: typeof task_history;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};

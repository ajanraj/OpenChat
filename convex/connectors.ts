import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { ERROR_CODES } from "../lib/error-codes";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { ensureAuthenticated } from "./lib/auth_helper";

// Type for connector types
const CONNECTOR_TYPES = v.union(
  v.literal("gmail"),
  v.literal("googlecalendar"),
  v.literal("googledrive"),
  v.literal("notion"),
  v.literal("googledocs"),
  v.literal("googlesheets"),
  v.literal("slack"),
  v.literal("linear"),
  v.literal("github"),
  v.literal("twitter")
);

/**
 * List all connectors for the authenticated user
 */
export const listUserConnectors = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("connectors"),
      _creationTime: v.number(),
      userId: v.id("users"),
      type: CONNECTOR_TYPES,
      connectionId: v.string(),
      isConnected: v.boolean(),
      enabled: v.optional(v.boolean()),
      displayName: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];
    }
    const connectors = await ctx.db
      .query("connectors")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return connectors;
  },
});

/**
 * Get a specific connector by type for the authenticated user
 */
export const getConnectorByType = query({
  args: {
    type: CONNECTOR_TYPES,
  },
  returns: v.union(
    v.object({
      _id: v.id("connectors"),
      _creationTime: v.number(),
      userId: v.id("users"),
      type: CONNECTOR_TYPES,
      connectionId: v.string(),
      isConnected: v.boolean(),
      enabled: v.optional(v.boolean()),
      displayName: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const connector = await ctx.db
      .query("connectors")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", userId).eq("type", args.type)
      )
      .unique();

    return connector ?? null;
  },
});

/**
 * Save a new connection for the authenticated user
 */
export const saveConnection = mutation({
  args: {
    type: CONNECTOR_TYPES,
    connectionId: v.string(),
    displayName: v.optional(v.string()),
  },
  returns: v.id("connectors"),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    // Check if connector already exists
    const existingConnector = await ctx.db
      .query("connectors")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", userId).eq("type", args.type)
      )
      .unique();

    if (existingConnector) {
      // Update existing connector
      await ctx.db.patch(existingConnector._id, {
        connectionId: args.connectionId,
        isConnected: true,
        // Ensure connector is enabled when (re)connecting
        enabled: true,
        displayName: args.displayName,
      });
      return existingConnector._id;
    }

    // Create new connector
    const connectorId = await ctx.db.insert("connectors", {
      userId,
      type: args.type,
      connectionId: args.connectionId,
      isConnected: true,
      enabled: true,
      displayName: args.displayName,
    });

    return connectorId;
  },
});

/**
 * Remove a connection for the authenticated user
 */
export const removeConnection = mutation({
  args: {
    type: CONNECTOR_TYPES,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);
    const connector = await ctx.db
      .query("connectors")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", userId).eq("type", args.type)
      )
      .unique();

    if (!connector) {
      throw new ConvexError(ERROR_CODES.CONNECTOR_NOT_FOUND);
    }

    await ctx.db.delete(connector._id);
    return null;
  },
});

/**
 * Update connection status for the authenticated user
 */
export const updateConnectionStatus = mutation({
  args: {
    type: CONNECTOR_TYPES,
    isConnected: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);
    const connector = await ctx.db
      .query("connectors")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", userId).eq("type", args.type)
      )
      .unique();

    if (!connector) {
      throw new ConvexError(ERROR_CODES.CONNECTOR_NOT_FOUND);
    }

    await ctx.db.patch(connector._id, {
      isConnected: args.isConnected,
    });
    return null;
  },
});

/**
 * Enable/disable a connector for the authenticated user (without removing connection)
 */
export const setConnectorEnabled = mutation({
  args: {
    type: CONNECTOR_TYPES,
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ensureAuthenticated(ctx);

    const connector = await ctx.db
      .query("connectors")
      .withIndex("by_user_and_type", (q) =>
        q.eq("userId", userId).eq("type", args.type)
      )
      .unique();

    if (!connector) {
      throw new ConvexError(ERROR_CODES.CONNECTOR_NOT_FOUND);
    }

    await ctx.db.patch(connector._id, { enabled: args.enabled });
    return null;
  },
});

/**
 * Internal function to get connected connectors for a user (for scheduled tasks)
 */
export const getConnectedConnectors = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.array(
    v.object({
      _id: v.id("connectors"),
      _creationTime: v.number(),
      userId: v.id("users"),
      type: CONNECTOR_TYPES,
      connectionId: v.string(),
      isConnected: v.boolean(),
      enabled: v.optional(v.boolean()),
      displayName: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const connectors = await ctx.db
      .query("connectors")
      .withIndex("by_user_and_connected", (q) =>
        q.eq("userId", args.userId).eq("isConnected", true)
      )
      .collect();

    // Only include connectors that are explicitly enabled or don't have
    // the flag set (backward-compatible default: enabled)
    const enabledConnectors = connectors.filter((c) => c.enabled !== false);

    return enabledConnectors;
  },
});

/**
 * Internal function to sync connection status with Composio
 */
export const syncConnectionStatus = internalMutation({
  args: {
    connectorId: v.id("connectors"),
    isConnected: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectorId, {
      isConnected: args.isConnected,
    });

    return null;
  },
});

/**
 * Internal: List all connectors for a given user (including disabled)
 */
export const getAllUserConnectors = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("connectors"),
      _creationTime: v.number(),
      userId: v.id("users"),
      type: CONNECTOR_TYPES,
      connectionId: v.string(),
      isConnected: v.boolean(),
      enabled: v.optional(v.boolean()),
      displayName: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const connectors = await ctx.db
      .query("connectors")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return connectors;
  },
});

import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { ERROR_CODES } from "../lib/error-codes";
import { mutation, query } from "./_generated/server";

const API_KEY_SECRET = process.env.API_KEY_SECRET;
if (!API_KEY_SECRET) {
  throw new Error(
    "CRITICAL SECURITY ERROR: API_KEY_SECRET environment variable is required but not set. API keys cannot be stored securely without encryption. Set API_KEY_SECRET to continue."
  );
}

// Define regex at top level for performance
const HEX_REGEX = /^[0-9a-fA-F]+$/;

// Convert string to ArrayBuffer
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(str);
  // Create a new ArrayBuffer and copy the data
  const buffer = new ArrayBuffer(uint8Array.length);
  const view = new Uint8Array(buffer);
  view.set(uint8Array);
  return buffer;
}

// Convert ArrayBuffer to string
function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}

// Convert ArrayBuffer to hex string
function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Convert hex string to ArrayBuffer
function hexToArrayBuffer(hex: string): ArrayBuffer {
  // Input validation
  if (typeof hex !== "string") {
    throw new Error("Input must be a string");
  }

  if (hex.length === 0) {
    throw new Error("Input string cannot be empty");
  }

  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have an even length");
  }

  // Check if string contains only valid hexadecimal characters
  if (!HEX_REGEX.test(hex)) {
    throw new Error("Input string contains invalid hexadecimal characters");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

async function getKey(userId: string): Promise<CryptoKey> {
  if (!API_KEY_SECRET) {
    throw new Error("API_KEY_SECRET not configured");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    stringToArrayBuffer(API_KEY_SECRET),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  // Create a unique salt per user using a hash for additional security
  const userIdHash = await crypto.subtle.digest(
    "SHA-256",
    stringToArrayBuffer(userId)
  );
  const userSalt = `convex-api-keys-${arrayBufferToHex(userIdHash)}`;

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: stringToArrayBuffer(userSalt), // User-specific salt for security
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(text: string, userId: string): Promise<string> {
  if (!API_KEY_SECRET) {
    throw new Error("Cannot encrypt API key: API_KEY_SECRET not configured");
  }

  try {
    const key = await getKey(userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = stringToArrayBuffer(text);

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    return `${arrayBufferToHex(iv.buffer)}:${arrayBufferToHex(encrypted)}`;
  } catch {
    // Prevent sensitive information leakage by throwing a generic error
    throw new Error("Failed to encrypt API key");
  }
}

async function decrypt(payload: string, userId: string): Promise<string> {
  if (!API_KEY_SECRET) {
    throw new Error("Cannot decrypt API key: API_KEY_SECRET not configured");
  }

  // Validate payload format before splitting
  if (typeof payload !== "string") {
    throw new Error("Payload must be a string");
  }

  if (payload.length === 0) {
    throw new Error("Payload cannot be empty");
  }

  const colonCount = (payload.match(/:/g) || []).length;
  if (colonCount !== 1) {
    throw new Error(
      "Invalid payload format: must contain exactly one colon separator between IV and data parts"
    );
  }

  const [ivHex, dataHex] = payload.split(":");
  const key = await getKey(userId);
  const iv = hexToArrayBuffer(ivHex);
  const data = hexToArrayBuffer(dataHex);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return arrayBufferToString(decrypted);
  } catch {
    // Silently handle decryption errors to prevent sensitive information leakage
    throw new Error("Failed to decrypt API key");
  }
}

export const getApiKeys = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("user_api_keys"),
      provider: v.string(),
      mode: v.optional(v.union(v.literal("priority"), v.literal("fallback"))),
      messageCount: v.optional(v.number()),
      createdAt: v.optional(v.number()),
      updatedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      // Return empty array for unauthenticated users
      return [];
    }
    const keys = await ctx.db
      .query("user_api_keys")
      .withIndex("by_user_provider", (q) => q.eq("userId", userId))
      .collect();
    return keys.map(
      ({ _id, provider, mode, messageCount, createdAt, updatedAt }) => ({
        _id,
        provider,
        mode,
        messageCount,
        createdAt,
        updatedAt,
      })
    );
  },
});

export const saveApiKey = mutation({
  args: {
    provider: v.union(
      v.literal("openrouter"),
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("gemini"),
      v.literal("mistral"),
      v.literal("meta"),
      v.literal("Qwen")
    ),
    key: v.string(),
    mode: v.optional(v.union(v.literal("priority"), v.literal("fallback"))),
  },
  returns: v.null(),
  handler: async (ctx, { provider, key, mode }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    const [encrypted, existing] = await Promise.all([
      encrypt(key, userId),
      ctx.db
        .query("user_api_keys")
        .withIndex("by_user_provider", (q) =>
          q.eq("userId", userId).eq("provider", provider)
        )
        .unique(),
    ]);
    const now = Date.now();
    // Default to "fallback" mode if not specified
    const finalMode = mode || "fallback";
    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedKey: encrypted,
        mode: finalMode,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("user_api_keys", {
        userId,
        provider,
        encryptedKey: encrypted,
        mode: finalMode,
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const deleteApiKey = mutation({
  args: {
    provider: v.union(
      v.literal("openrouter"),
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("gemini"),
      v.literal("mistral"),
      v.literal("meta"),
      v.literal("Qwen")
    ),
  },
  returns: v.null(),
  handler: async (ctx, { provider }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    const existing = await ctx.db
      .query("user_api_keys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", provider)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

export const updateApiKeyMode = mutation({
  args: {
    provider: v.union(
      v.literal("openrouter"),
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("gemini"),
      v.literal("mistral"),
      v.literal("meta"),
      v.literal("Qwen")
    ),
    mode: v.union(v.literal("priority"), v.literal("fallback")),
  },
  returns: v.null(),
  handler: async (ctx, { provider, mode }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    const existing = await ctx.db
      .query("user_api_keys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", provider)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { mode, updatedAt: Date.now() });
    }
    return null;
  },
});

export const getDecryptedKey = query({
  args: {
    provider: v.union(
      v.literal("openrouter"),
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("gemini"),
      v.literal("mistral"),
      v.literal("meta"),
      v.literal("Qwen")
    ),
  },
  handler: async (ctx, { provider }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    const existing = await ctx.db
      .query("user_api_keys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", provider)
      )
      .unique();
    if (!existing) {
      return null;
    }
    return await decryptKey(existing.encryptedKey, userId);
  },
});

export async function decryptKey(encrypted: string, userId: string) {
  return await decrypt(encrypted, userId);
}

export const incrementUserApiKeyUsage = mutation({
  args: { provider: v.string() },
  returns: v.null(),
  handler: async (ctx, { provider }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError(ERROR_CODES.NOT_AUTHENTICATED);
    }
    const existing = await ctx.db
      .query("user_api_keys")
      .withIndex("by_user_provider", (q) =>
        q.eq("userId", userId).eq("provider", provider)
      )
      .unique();
    if (existing) {
      const currentCount = existing.messageCount || 0;
      await ctx.db.patch(existing._id, { messageCount: currentCount + 1 });
    }
    return null;
  },
});

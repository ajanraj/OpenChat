/**
 * Translation layer to convert Composio tools (AI SDK v4 format) to v5 format
 *
 * Composio tools use v4 format:
 * - `parameters.jsonSchema` (nested structure)
 * - `execute` function with different signature
 *
 * AI SDK v5 format:
 * - `inputSchema` (direct JSON schema using jsonSchema helper)
 * - `execute` function with updated signature
 */

import type { JSONSchema7, Tool } from "ai";
import { jsonSchema } from "ai";

/**
 * Tool execution response
 */
interface ToolExecuteResponse {
  data: Record<string, unknown>;
  error: string | null;
  successful: boolean;
}

/**
 * Composio tool structure (v4 format)
 */
interface ComposioTool {
  description: string;
  parameters: {
    jsonSchema: JSONSchema7;
  };
  execute: (params: Record<string, unknown>) => Promise<ToolExecuteResponse>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Plain (non-array) objects; cleanSchemaValue turns every schema object into one
const isSchemaObject = (value: unknown): value is JSONSchema7 =>
  isRecord(value);

type CleanValue = (value: unknown) => unknown;

// `items` without a type defaults to an object schema
const cleanItems = (items: object, clean: CleanValue): unknown => {
  const cleanedItems = clean(items);
  if (isRecord(cleanedItems)) {
    const hasType = Boolean(cleanedItems.type);
    if (!hasType) {
      cleanedItems.type = "object";
      const hasProperties = Boolean(cleanedItems.properties);
      if (!hasProperties) {
        cleanedItems.properties = {};
      }
    }
  }
  return cleanedItems;
};

// Cleans every property schema, keeping undefined ones
const cleanProperties = (
  properties: object,
  clean: CleanValue
): Record<string, unknown> => {
  const cleanedProps: Record<string, unknown> = {};
  for (const [propKey, propValue] of Object.entries(properties)) {
    cleanedProps[propKey] = clean(propValue);
  }
  return cleanedProps;
};

// `clean` is cleanSchemaValue, passed in because the helpers recurse through it
const cleanSchemaEntry = (
  key: string,
  value: unknown,
  clean: CleanValue
): unknown => {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (key === "items") {
    return cleanItems(value, clean);
  }
  if (key === "properties") {
    return cleanProperties(value, clean);
  }
  return clean(value);
};

// Recursively cleans a schema value: drops undefined fields and adds missing array `items`
const cleanSchemaValue = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(cleanSchemaValue);
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    // Skip undefined values
    if (entry !== undefined) {
      result[key] = cleanSchemaEntry(key, entry, cleanSchemaValue);
    }
  }

  // Special handling for array types without items
  const hasItems = Boolean(result.items);
  if (result.type === "array" && !hasItems) {
    result.items = { type: "object", properties: {} };
  }

  return result;
};

/**
 * Clean JSON Schema to ensure compatibility with AI SDK v5
 * This fixes common issues with Composio's JSON Schema format. Builds a new schema; the input
 * is not mutated.
 * @throws {TypeError} When the schema is not an object, so the tool is skipped
 */
const cleanJsonSchema = (schema: JSONSchema7): JSONSchema7 => {
  const cleaned = cleanSchemaValue(schema);
  if (!isSchemaObject(cleaned)) {
    throw new TypeError("Composio tool JSON Schema must be an object");
  }
  return cleaned;
};

/**
 * Convert a single Composio tool to AI SDK v5 format
 */
export const convertComposioTool = (
  _toolName: string,
  composioTool: ComposioTool
): Tool => {
  // Clean the JSON Schema to fix compatibility issues
  const cleanedSchema = cleanJsonSchema(composioTool.parameters.jsonSchema);

  // Use jsonSchema helper to pass JSON Schema directly
  const inputSchema = jsonSchema(cleanedSchema);

  return {
    description: composioTool.description,
    inputSchema,
    execute: async (input: Record<string, unknown>) => {
      // Convert the input to the format expected by Composio
      const result = await composioTool.execute(input);
      return result;
    },
  };
};

/**
 * Convert all Composio tools to AI SDK v5 format
 */
export const convertComposioTools = (
  composioTools: Record<string, ComposioTool>
): Record<string, Tool> => {
  const convertedTools: Record<string, Tool> = {};

  for (const [toolName, composioTool] of Object.entries(composioTools)) {
    try {
      convertedTools[toolName] = convertComposioTool(toolName, composioTool);
    } catch {
      // console.warn(`Failed to convert Composio tool "${toolName}":`, error);
      // Skip tools that fail to convert
    }
  }

  return convertedTools;
};

/**
 * Type guard to check if an value is a Composio tool
 */
export const isComposioTool = (obj: unknown): obj is ComposioTool =>
  obj !== null &&
  typeof obj === "object" &&
  obj !== undefined &&
  "description" in obj &&
  typeof obj.description === "string" &&
  "parameters" in obj &&
  obj.parameters !== null &&
  typeof obj.parameters === "object" &&
  "jsonSchema" in obj.parameters &&
  typeof obj.parameters.jsonSchema === "object" &&
  "execute" in obj &&
  typeof obj.execute === "function";

/**
 * Validate that all tools in an object are Composio tools
 */
export const validateComposioTools = (
  tools: Record<string, unknown>
): tools is Record<string, ComposioTool> =>
  Object.values(tools).every(isComposioTool);

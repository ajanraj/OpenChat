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
type ToolExecuteResponse = {
  data: Record<string, unknown>;
  error: string | null;
  successful: boolean;
};

/**
 * Composio tool structure (v4 format)
 */
type ComposioTool = {
  description: string;
  parameters: {
    jsonSchema: JSONSchema7;
  };
  execute: (params: Record<string, unknown>) => Promise<ToolExecuteResponse>;
};

/**
 * Clean JSON Schema to ensure compatibility with AI SDK v5
 * This fixes common issues with Composio's JSON Schema format
 */
function cleanJsonSchema(schema: JSONSchema7): JSONSchema7 {
  const cleaned = JSON.parse(JSON.stringify(schema));

  // Recursively clean the schema
  function cleanObject(obj: unknown): JSONSchema7 {
    if (typeof obj !== "object" || obj === null) {
      return obj as JSONSchema7;
    }

    if (Array.isArray(obj)) {
      return obj.map(cleanObject) as JSONSchema7;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip undefined values
      if (value === undefined) {
        continue;
      }

      // Handle arrays - ensure items property exists
      if (key === "type" && value === "array") {
        result[key] = value;
        // Will be handled by the parent object
      } else if (key === "items" && value && typeof value === "object") {
        // Ensure items has a valid structure
        const cleanedItems = cleanObject(value);
        if (
          typeof cleanedItems === "object" &&
          cleanedItems !== null &&
          !Array.isArray(cleanedItems) &&
          !cleanedItems.type
        ) {
          // If items doesn't have a type, default to object
          (cleanedItems as Record<string, unknown>).type = "object";
          if (!(cleanedItems as Record<string, unknown>).properties) {
            (cleanedItems as Record<string, unknown>).properties = {};
          }
        }
        result[key] = cleanedItems;
      } else if (key === "properties" && value && typeof value === "object") {
        // Clean all properties recursively
        const cleanedProps: Record<string, JSONSchema7> = {};
        for (const [propKey, propValue] of Object.entries(value)) {
          cleanedProps[propKey] = cleanObject(propValue);
        }
        result[key] = cleanedProps;
      } else if (typeof value === "object") {
        result[key] = cleanObject(value);
      } else {
        result[key] = value;
      }
    }

    // Special handling for array types without items
    if (result.type === "array" && !result.items) {
      // console.warn('Array type without items definition, adding default items');
      result.items = { type: "object", properties: {} };
    }

    return result as JSONSchema7;
  }

  return cleanObject(cleaned);
}

/**
 * Convert a single Composio tool to AI SDK v5 format
 */
export function convertComposioTool(
  _toolName: string,
  composioTool: ComposioTool
): Tool {
  // Clean the JSON Schema to fix compatibility issues
  const cleanedSchema = cleanJsonSchema(composioTool.parameters.jsonSchema);

  // Use jsonSchema helper to pass JSON Schema directly
  const inputSchema = jsonSchema(cleanedSchema);

  return {
    description: composioTool.description,
    inputSchema,
    execute: async (input) => {
      // Convert the input to the format expected by Composio
      const result = await composioTool.execute(input);
      return result;
    },
  };
}

/**
 * Convert all Composio tools to AI SDK v5 format
 */
export function convertComposioTools(
  composioTools: Record<string, ComposioTool>
): Record<string, Tool> {
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
}

/**
 * Type guard to check if an value is a Composio tool
 */
export function isComposioTool(obj: unknown): obj is ComposioTool {
  return (
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
    typeof obj.execute === "function"
  );
}

/**
 * Validate that all tools in an object are Composio tools
 */
export function validateComposioTools(
  tools: Record<string, unknown>
): tools is Record<string, ComposioTool> {
  return Object.values(tools).every(isComposioTool);
}

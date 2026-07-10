import type { JSONSchema7 } from "ai";
import { describe, expect, it, vi } from "vitest";
import {
  convertComposioTool,
  convertComposioTools,
  isComposioTool,
  validateComposioTools,
} from "../composio-tool-adapter";

// Type for Composio tool (matching the adapter's expected type)
interface ComposioToolMock {
  description: string;
  parameters: {
    jsonSchema: JSONSchema7;
  };
  execute: (params: Record<string, unknown>) => Promise<{
    data: Record<string, unknown>;
    error: string | null;
    successful: boolean;
  }>;
}

// Mock composio tool for testing
const createMockComposioTool = (overrides: Partial<ComposioToolMock> = {}): ComposioToolMock => ({
  description: "Test tool description",
  parameters: {
    jsonSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const },
        age: { type: "number" as const },
      },
      required: ["name"],
    },
  },
  execute: vi.fn().mockResolvedValue({
    data: { result: "success" },
    error: null,
    successful: true,
  }),
  ...overrides,
});

describe("composio-tool-adapter", () => {
  describe("isComposioTool", () => {
    it("returns true for valid Composio tool", () => {
      const tool = createMockComposioTool();

      expect(isComposioTool(tool)).toBe(true);
    });

    it("returns false for null", () => {
      expect(isComposioTool(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isComposioTool(undefined)).toBe(false);
    });

    it("returns false for non-object", () => {
      expect(isComposioTool("string")).toBe(false);
      expect(isComposioTool(123)).toBe(false);
      expect(isComposioTool(true)).toBe(false);
    });

    it("returns false when missing description", () => {
      const tool = createMockComposioTool();
      delete (tool as unknown as Record<string, unknown>).description;

      expect(isComposioTool(tool)).toBe(false);
    });

    it("returns false when description is not string", () => {
      const tool = createMockComposioTool({
        description: 123 as unknown as string,
      });

      expect(isComposioTool(tool)).toBe(false);
    });

    it("returns false when missing parameters", () => {
      const tool = createMockComposioTool();
      delete (tool as unknown as Record<string, unknown>).parameters;

      expect(isComposioTool(tool)).toBe(false);
    });

    it("returns false when parameters is null", () => {
      const tool = createMockComposioTool({
        parameters: null as unknown as ComposioToolMock["parameters"],
      });

      expect(isComposioTool(tool)).toBe(false);
    });

    it("returns false when missing jsonSchema in parameters", () => {
      const tool = createMockComposioTool({
        parameters: {} as unknown as ComposioToolMock["parameters"],
      });

      expect(isComposioTool(tool)).toBe(false);
    });

    it("returns false when jsonSchema is not object", () => {
      const tool = createMockComposioTool({
        parameters: {
          jsonSchema: "not-object" as unknown as JSONSchema7,
        },
      });

      expect(isComposioTool(tool)).toBe(false);
    });

    it("returns false when missing execute", () => {
      const tool = createMockComposioTool();
      delete (tool as unknown as Record<string, unknown>).execute;

      expect(isComposioTool(tool)).toBe(false);
    });

    it("returns false when execute is not a function", () => {
      const tool = createMockComposioTool({
        execute: "not-function" as unknown as ComposioToolMock["execute"],
      });

      expect(isComposioTool(tool)).toBe(false);
    });
  });

  describe("validateComposioTools", () => {
    it("returns true when all tools are valid Composio tools", () => {
      const tools = {
        tool1: createMockComposioTool(),
        tool2: createMockComposioTool({ description: "Another tool" }),
      };

      expect(validateComposioTools(tools)).toBe(true);
    });

    it("returns true for empty object", () => {
      expect(validateComposioTools({})).toBe(true);
    });

    it("returns false when any tool is invalid", () => {
      const tools = {
        validTool: createMockComposioTool(),
        invalidTool: { description: "Missing other properties" },
      };

      expect(validateComposioTools(tools)).toBe(false);
    });
  });

  describe("convertComposioTool", () => {
    it("converts tool with correct description", () => {
      const composioTool = createMockComposioTool({
        description: "My custom tool",
      });

      const converted = convertComposioTool("testTool", composioTool);

      expect(converted.description).toBe("My custom tool");
    });

    it("converts tool with inputSchema", () => {
      const composioTool = createMockComposioTool();

      const converted = convertComposioTool("testTool", composioTool);

      expect(converted.inputSchema).toBeDefined();
    });

    it("preserves execute function", async () => {
      const mockExecute = vi.fn().mockResolvedValue({
        data: { test: "value" },
        error: null,
        successful: true,
      });
      const composioTool = createMockComposioTool({ execute: mockExecute });

      const converted = convertComposioTool("testTool", composioTool);

      // Execute is defined for converted tools
      expect(converted.execute).toBeDefined();
      const result = await converted.execute?.({ name: "test" }, {} as never);
      expect(mockExecute).toHaveBeenCalledWith({ name: "test" });
      expect(result).toEqual({
        data: { test: "value" },
        error: null,
        successful: true,
      });
    });

    it("handles array types in schema", () => {
      const composioTool = createMockComposioTool({
        parameters: {
          jsonSchema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      });

      const converted = convertComposioTool("testTool", composioTool);

      expect(converted.inputSchema).toBeDefined();
    });

    it("handles array types without items definition", () => {
      const composioTool = createMockComposioTool({
        parameters: {
          jsonSchema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                // Missing items definition
              },
            },
          },
        },
      });

      const converted = convertComposioTool("testTool", composioTool);

      expect(converted.inputSchema).toBeDefined();
    });

    it("handles nested object properties", () => {
      const composioTool = createMockComposioTool({
        parameters: {
          jsonSchema: {
            type: "object",
            properties: {
              nested: {
                type: "object",
                properties: {
                  inner: { type: "string" },
                },
              },
            },
          },
        },
      });

      const converted = convertComposioTool("testTool", composioTool);

      expect(converted.inputSchema).toBeDefined();
    });
  });

  describe("convertComposioTools", () => {
    it("converts multiple tools", () => {
      const composioTools = {
        tool1: createMockComposioTool({ description: "Tool 1" }),
        tool2: createMockComposioTool({ description: "Tool 2" }),
      };

      const converted = convertComposioTools(composioTools);

      expect(Object.keys(converted)).toHaveLength(2);
      expect(converted.tool1).toBeDefined();
      expect(converted.tool2).toBeDefined();
      expect(converted.tool1.description).toBe("Tool 1");
      expect(converted.tool2.description).toBe("Tool 2");
    });

    it("returns empty object for empty input", () => {
      const converted = convertComposioTools({});

      expect(converted).toEqual({});
    });

    it("preserves tool names", () => {
      const composioTools = {
        GMAIL_SEND_EMAIL: createMockComposioTool(),
        NOTION_CREATE_PAGE: createMockComposioTool(),
      };

      const converted = convertComposioTools(composioTools);

      expect(converted.GMAIL_SEND_EMAIL).toBeDefined();
      expect(converted.NOTION_CREATE_PAGE).toBeDefined();
    });

    it("skips tools that fail to convert", () => {
      const composioTools = {
        validTool: createMockComposioTool(),
        // This will cause an error during conversion due to undefined jsonSchema
        invalidTool: {
          description: "Invalid",
          parameters: {
            jsonSchema: undefined as unknown as JSONSchema7,
          },
          execute: vi.fn(),
        },
      };

      const converted = convertComposioTools(composioTools);

      // Only valid tool should be in result
      expect(converted.validTool).toBeDefined();
      expect(converted.invalidTool).toBeUndefined();
      expect(Object.keys(converted)).toHaveLength(1);
    });
  });
});

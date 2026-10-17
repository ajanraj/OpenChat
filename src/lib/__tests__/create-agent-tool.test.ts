import * as ai from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { getToolSpecificPrompts } from "@/lib/prompt-tool-config";

import type { ComposioToolsSession } from "../composio-server";
import {
  analyzeSubAgentExecution,
  appendComposioToolRouterInstructions,
  createAgentTool,
  createAgentInputSchema,
  toolListSchema,
} from "../create-agent-tool";

const { mockGetComposioTools, mockStreamText } = vi.hoisted(() => ({
  mockGetComposioTools:
    vi.fn<
      (
        userId: string,
        toolkitSlugs: string[],
        signal?: AbortSignal
      ) => Promise<ComposioToolsSession | null>
    >(),
  mockStreamText: vi.fn<typeof ai.streamText>(),
}));

// A vi.fn can't take streamText's generic signature, so the factory is checked against the
// rest of the module only
vi.mock<Omit<typeof ai, "streamText">>(
  import("ai"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    streamText: mockStreamText,
  })
);

// Mock the composio-server module to avoid environment variable requirements
vi.mock(import("@/lib/composio-server"), () => ({
  getComposioTools: mockGetComposioTools,
}));

// Mock prompt-tool-config to avoid any side effects
vi.mock(import("@/lib/prompt-tool-config"), () => ({
  getToolSpecificPrompts: vi
    .fn<typeof getToolSpecificPrompts>()
    .mockReturnValue(""),
}));

const successfulConnectorResult: ai.DynamicToolResult = {
  type: "tool-result",
  toolCallId: "connector-call",
  toolName: "COMPOSIO_MULTI_EXECUTE_TOOL",
  input: {},
  output: { data: {}, error: null, successful: true },
  dynamic: true,
};

describe("create-agent-tool", () => {
  it("closes its Composio session when agent execution fails", async () => {
    const close = vi.fn<() => Promise<void>>().mockResolvedValue();
    mockGetComposioTools.mockResolvedValue({
      tools: {
        TEST_TOOL: ai.tool({
          description: "Test connector tool",
          inputSchema: z.object({}),
          execute: () => ({ successful: true, error: null }),
        }),
      },
      close,
    });
    mockStreamText.mockImplementation(() => {
      throw new Error("Agent startup failed");
    });
    const writer: ai.UIMessageStreamWriter = {
      write: vi.fn<ai.UIMessageStreamWriter["write"]>(),
      merge: vi.fn<ai.UIMessageStreamWriter["merge"]>(),
      onError: undefined,
    };
    const agentTool = createAgentTool({
      userId: "user-123",
      availableToolkits: ["GMAIL"],
      model: "test-model",
      writer,
    });

    if (!agentTool.execute) {
      throw new Error("Expected create-agent tool to be executable");
    }

    await expect(
      agentTool.execute(
        { tool: "GMAIL", task: "Send an email" },
        { toolCallId: "agent-call", messages: [], context: {} }
      )
    ).rejects.toThrow("Agent startup failed");
    expect(close).toHaveBeenCalledOnce();
  });

  it("passes reasoning effort to the nested stream", async () => {
    const close = vi.fn<() => Promise<void>>().mockResolvedValue();
    mockGetComposioTools.mockResolvedValue({
      tools: {
        TEST_TOOL: ai.tool({
          description: "Test connector tool",
          inputSchema: z.object({}),
          execute: () => ({ successful: true, error: null }),
        }),
      },
      close,
    });
    mockStreamText.mockImplementation(() => {
      throw new Error("Stop after inspecting options");
    });
    const writer: ai.UIMessageStreamWriter = {
      write: vi.fn<ai.UIMessageStreamWriter["write"]>(),
      merge: vi.fn<ai.UIMessageStreamWriter["merge"]>(),
      onError: undefined,
    };
    const agentTool = createAgentTool({
      userId: "user-123",
      availableToolkits: ["GMAIL"],
      model: "test-model",
      reasoning: "high",
      writer,
    });

    if (!agentTool.execute) {
      throw new Error("Expected create-agent tool to be executable");
    }

    await expect(
      agentTool.execute(
        { tool: "GMAIL", task: "Send an email" },
        { toolCallId: "agent-call", messages: [], context: {} }
      )
    ).rejects.toThrow("Stop after inspecting options");
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({ reasoning: "high" })
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("stops the nested agent promptly when the caller aborts", async () => {
    const close = vi.fn<() => Promise<void>>().mockResolvedValue();
    mockGetComposioTools.mockResolvedValue({
      tools: {
        TEST_TOOL: ai.tool({
          description: "Test connector tool",
          inputSchema: z.object({}),
          execute: () => ({ successful: true, error: null }),
        }),
      },
      close,
    });
    // A model that streams nothing until it is cancelled, like a stalled provider
    const model = new MockLanguageModelV4({
      doStream: { stream: new ReadableStream() },
    });
    const { streamText } = await vi.importActual<typeof ai>("ai");
    mockStreamText.mockImplementation((options) =>
      streamText({ ...options, model })
    );
    const writer: ai.UIMessageStreamWriter = {
      write: vi.fn<ai.UIMessageStreamWriter["write"]>(),
      merge: vi.fn<ai.UIMessageStreamWriter["merge"]>(),
      onError: undefined,
    };
    const agentTool = createAgentTool({
      userId: "user-123",
      availableToolkits: ["GMAIL"],
      model: "test-model",
      writer,
    });

    if (!agentTool.execute) {
      throw new Error("Expected create-agent tool to be executable");
    }

    const controller = new AbortController();
    const execution = agentTool.execute(
      { tool: "GMAIL", task: "Send an email" },
      {
        toolCallId: "agent-call",
        messages: [],
        context: {},
        abortSignal: controller.signal,
      }
    );
    await vi.waitFor(() => {
      expect(model.doStreamCalls).toHaveLength(1);
    });
    controller.abort(new Error("Run deadline reached"));

    await expect(execution).rejects.toThrow("Run deadline reached");
    expect(mockGetComposioTools).toHaveBeenCalledWith(
      "user-123",
      ["GMAIL"],
      controller.signal
    );
    expect(close).toHaveBeenCalledOnce();
  });

  describe("createAgentInputSchema schema", () => {
    describe("tool field validation", () => {
      it("accepts a single string tool name", () => {
        const result = createAgentInputSchema.safeParse({
          tool: "GMAIL",
          task: "Send an email to test@example.com",
        });

        expect(result.success).toBeTruthy();
        expect(result.success && result.data.tool).toBe("GMAIL");
      });

      it("accepts an array of tool names", () => {
        const result = createAgentInputSchema.safeParse({
          tool: ["GMAIL", "NOTION"],
          task: "Create a note and email it",
        });

        expect(result.success).toBeTruthy();
        expect(result.success && result.data.tool).toStrictEqual([
          "GMAIL",
          "NOTION",
        ]);
      });

      it("rejects empty string tool name", () => {
        const result = createAgentInputSchema.safeParse({
          tool: "",
          task: "Send an email",
        });

        expect(result.success).toBeFalsy();
      });

      it("rejects empty array of tools", () => {
        const result = createAgentInputSchema.safeParse({
          tool: [],
          task: "Send an email",
        });

        expect(result.success).toBeFalsy();
      });
    });

    describe("task field validation", () => {
      it("accepts a valid task description", () => {
        const result = createAgentInputSchema.safeParse({
          tool: "GMAIL",
          task: "Send an email to the team about the meeting",
        });

        expect(result.success).toBeTruthy();
      });

      it("rejects empty task", () => {
        const result = createAgentInputSchema.safeParse({
          tool: "GMAIL",
          task: "",
        });

        expect(result.success).toBeFalsy();
      });

      it("rejects task over 2000 characters", () => {
        const longTask = "a".repeat(2001);
        const result = createAgentInputSchema.safeParse({
          tool: "GMAIL",
          task: longTask,
        });

        expect(result.success).toBeFalsy();
      });

      it("accepts task exactly 2000 characters", () => {
        const maxTask = "a".repeat(2000);
        const result = createAgentInputSchema.safeParse({
          tool: "GMAIL",
          task: maxTask,
        });

        expect(result.success).toBeTruthy();
      });
    });

    describe("context field validation", () => {
      it("accepts optional context", () => {
        const result = createAgentInputSchema.safeParse({
          tool: "GMAIL",
          task: "Send an email",
          context: "Previous operation returned user list",
        });

        expect(result.success).toBeTruthy();
        expect(result.success && result.data.context).toBe(
          "Previous operation returned user list"
        );
      });

      it("accepts missing context", () => {
        const result = createAgentInputSchema.safeParse({
          tool: "GMAIL",
          task: "Send an email",
        });

        expect(result.success).toBeTruthy();
        expect(result.success && result.data.context).toBeUndefined();
      });

      it("rejects context over 5000 characters", () => {
        const longContext = "a".repeat(5001);
        const result = createAgentInputSchema.safeParse({
          tool: "GMAIL",
          task: "Send an email",
          context: longContext,
        });

        expect(result.success).toBeFalsy();
      });

      it("accepts context exactly 5000 characters", () => {
        const maxContext = "a".repeat(5000);
        const result = createAgentInputSchema.safeParse({
          tool: "GMAIL",
          task: "Send an email",
          context: maxContext,
        });

        expect(result.success).toBeTruthy();
      });
    });
  });

  describe(analyzeSubAgentExecution, () => {
    it("returns success when all conditions are met", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [
          { toolName: "COMPOSIO_SEARCH_TOOLS" },
          { toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" },
        ],
        toolResults: [successfulConnectorResult],
        finishReason: "stop",
        finalText: "Successfully sent the email to the recipient.",
        subAgentError: null,
      });

      expect(result.success).toBeTruthy();
      expect(result.toolCallCount).toBe(2);
      expect(result.toolNames).toStrictEqual([
        "COMPOSIO_SEARCH_TOOLS",
        "COMPOSIO_MULTI_EXECUTE_TOOL",
      ]);
      expect(result.finishReason).toBe("stop");
      expect(result.issues).toHaveLength(0);
    });

    it("returns failure when no tools were called", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [],
        toolResults: [],
        finishReason: "stop",
        finalText: "I couldn't complete the task without tools.",
        subAgentError: null,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain("No tools were called");
    });

    it("returns failure when the agent only searches for tools", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_SEARCH_TOOLS" }],
        toolResults: [],
        finishReason: "stop",
        finalText: "Found the Gmail send tool but did not execute it.",
        subAgentError: null,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain("No connector action was executed");
    });

    it("returns failure when finish reason is error", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" }],
        toolResults: [successfulConnectorResult],
        finishReason: "error",
        finalText: "An error occurred during execution.",
        subAgentError: null,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain("Sub-agent encountered an error");
    });

    it("returns failure when finish reason is tool-calls", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" }],
        toolResults: [successfulConnectorResult],
        finishReason: "tool-calls",
        finalText: "Started sending but got interrupted.",
        subAgentError: null,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain("Sub-agent stopped mid-execution");
    });

    it("returns failure when output is too short", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" }],
        toolResults: [successfulConnectorResult],
        finishReason: "stop",
        // Less than 25 characters
        finalText: "Done",
        subAgentError: null,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain("Insufficient output produced");
    });

    it("returns failure when there is an error", () => {
      const error = new Error("API rate limit exceeded");
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" }],
        toolResults: [successfulConnectorResult],
        finishReason: "stop",
        finalText: "Attempted to send email but failed due to rate limit.",
        subAgentError: error,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain("Error: API rate limit exceeded");
      expect(result.errorMessage).toBe("API rate limit exceeded");
    });

    it("truncates summary to 300 characters", () => {
      const longText = "a".repeat(500);
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" }],
        toolResults: [successfulConnectorResult],
        finishReason: "stop",
        finalText: longText,
        subAgentError: null,
      });

      expect(result.summary).toHaveLength(300);
    });

    it("handles length finish reason as success", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" }],
        toolResults: [successfulConnectorResult],
        finishReason: "length",
        finalText: "Successfully completed the task with full details.",
        subAgentError: null,
      });

      expect(result.success).toBeTruthy();
    });

    it("returns failure when a connector action has no result", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" }],
        toolResults: [],
        finishReason: "stop",
        finalText: "The connector action appeared to finish successfully.",
        subAgentError: null,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain("Connector action produced no result");
    });

    it("returns failure with the connector error from an unsuccessful result", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" }],
        toolResults: [
          {
            type: "tool-result",
            toolCallId: "connector-call",
            toolName: "COMPOSIO_MULTI_EXECUTE_TOOL",
            input: {},
            output: {
              data: {},
              error: "Gmail rejected the request",
              successful: false,
            },
            dynamic: true,
          },
        ],
        finishReason: "stop",
        finalText: "The connector action appeared to finish successfully.",
        subAgentError: null,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain(
        "Connector action failed: Gmail rejected the request"
      );
    });

    it("returns failure when the connector reports unsuccessful without an error message", () => {
      const result = analyzeSubAgentExecution({
        toolCalls: [{ toolName: "COMPOSIO_MULTI_EXECUTE_TOOL" }],
        toolResults: [
          {
            type: "tool-result",
            toolCallId: "connector-call",
            toolName: "COMPOSIO_MULTI_EXECUTE_TOOL",
            input: {},
            output: { data: {}, error: null, successful: false },
            dynamic: true,
          },
        ],
        finishReason: "stop",
        finalText: "The connector action appeared to finish successfully.",
        subAgentError: null,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain("Connector action failed");
    });

    it("collects multiple issues", () => {
      const error = new Error("Connection failed");
      const result = analyzeSubAgentExecution({
        toolCalls: [],
        toolResults: [],
        finishReason: "error",
        finalText: "Failed",
        subAgentError: error,
      });

      expect(result.success).toBeFalsy();
      expect(result.issues).toContain("Error: Connection failed");
      expect(result.issues).toContain("No tools were called");
      expect(result.issues).toContain("Sub-agent encountered an error");
      expect(result.issues).toContain("Insufficient output produced");
    });
  });

  describe(appendComposioToolRouterInstructions, () => {
    it("preserves a custom prompt and appends search-then-execute guidance", () => {
      const result = appendComposioToolRouterInstructions(
        "Follow the user's custom policy."
      );

      for (const fragment of [
        "Follow the user's custom policy.",
        "COMPOSIO_SEARCH_TOOLS",
        "COMPOSIO_MULTI_EXECUTE_TOOL",
        "session_id",
        "A search alone does not complete the task",
        "reconnect it in Settings",
      ]) {
        expect(result).toContain(fragment);
      }
    });
  });

  describe("toolListSchema schema", () => {
    it("validates single string", () => {
      const result = toolListSchema.safeParse("GMAIL");
      expect(result.success).toBeTruthy();
    });

    it("validates array of strings", () => {
      const result = toolListSchema.safeParse(["GMAIL", "NOTION", "SLACK"]);
      expect(result.success).toBeTruthy();
    });

    it("rejects number", () => {
      const result = toolListSchema.safeParse(123);
      expect(result.success).toBeFalsy();
    });

    it("rejects array with empty strings", () => {
      const result = toolListSchema.safeParse(["GMAIL", ""]);
      expect(result.success).toBeFalsy();
    });

    it("rejects null", () => {
      const result = toolListSchema.safeParse(null);
      expect(result.success).toBeFalsy();
    });
  });
});

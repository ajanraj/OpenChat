import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSearchTool, formatMarkdown, processResults, truncateContent } from "../search";
import { searchWithFallback } from "../search-provider-factory";
import { SEARCH_CONFIG } from "../types";

vi.mock("../search-provider-factory", () => ({
  searchWithFallback: vi.fn<typeof searchWithFallback>(),
}));

describe("search utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("truncateContent", () => {
    it("returns content unchanged if shorter than max length", () => {
      const content = "Short content";
      const result = truncateContent(content);

      expect(result).toBe("Short content");
    });

    it("returns content unchanged if equal to max length", () => {
      const content = "a".repeat(SEARCH_CONFIG.maxTextCharacters);
      const result = truncateContent(content);

      expect(result).toBe(content);
    });

    it("truncates content with ellipsis if longer than max length", () => {
      const content = "a".repeat(SEARCH_CONFIG.maxTextCharacters + 100);
      const result = truncateContent(content);

      expect(result.length).toBe(SEARCH_CONFIG.maxTextCharacters);
      expect(result.endsWith("...")).toBe(true);
    });

    it("uses custom max length when provided", () => {
      const content = "This is a longer string that should be truncated";
      const result = truncateContent(content, 20);

      expect(result.length).toBe(20);
      expect(result).toBe("This is a longer ...");
    });

    it("handles empty string", () => {
      const result = truncateContent("");

      expect(result).toBe("");
    });

    it("handles single character", () => {
      const result = truncateContent("a");

      expect(result).toBe("a");
    });
  });

  describe("formatMarkdown", () => {
    it("formats basic result with title and description", () => {
      const result = {
        url: "https://example.com",
        title: "Example Title",
        description: "Example description",
      };

      const markdown = formatMarkdown(result);

      expect(markdown).toContain("### [Example Title](https://example.com)");
      expect(markdown).toContain("Example description");
    });

    it("includes content in blockquote when present", () => {
      const result = {
        url: "https://example.com",
        title: "Title",
        description: "Description",
        content: "Full content here",
      };

      const markdown = formatMarkdown(result);

      expect(markdown).toContain("> Full content here");
    });

    it("truncates long content in markdown", () => {
      const longContent = "a".repeat(SEARCH_CONFIG.maxTextCharacters + 100);
      const result = {
        url: "https://example.com",
        title: "Title",
        description: "Description",
        content: longContent,
      };

      const markdown = formatMarkdown(result);

      expect(markdown).toContain("...");
    });

    it("does not include blockquote when content is undefined", () => {
      const result = {
        url: "https://example.com",
        title: "Title",
        description: "Description",
      };

      const markdown = formatMarkdown(result);

      expect(markdown).not.toContain(">");
    });

    it("handles empty description", () => {
      const result = {
        url: "https://example.com",
        title: "Title",
        description: "",
      };

      const markdown = formatMarkdown(result);

      expect(markdown).toContain("### [Title](https://example.com)");
    });
  });

  describe("processResults", () => {
    it("returns empty array for empty input", () => {
      const result = processResults([]);

      expect(result).toEqual([]);
    });

    it("truncates content in results", () => {
      const longContent = "a".repeat(SEARCH_CONFIG.maxTextCharacters + 100);
      const results = [
        {
          url: "https://example.com",
          title: "Title",
          description: "Description",
          content: longContent,
        },
      ];

      const processed = processResults(results);

      expect(processed[0].content?.length).toBe(SEARCH_CONFIG.maxTextCharacters);
      expect(processed[0].content?.endsWith("...")).toBe(true);
    });

    it("preserves undefined content", () => {
      const results = [
        {
          url: "https://example.com",
          title: "Title",
          description: "Description",
        },
      ];

      const processed = processResults(results);

      expect(processed[0].content).toBeUndefined();
    });

    it("uses existing markdown if present", () => {
      const results = [
        {
          url: "https://example.com",
          title: "Title",
          description: "Description",
          markdown: "# Custom Markdown",
        },
      ];

      const processed = processResults(results);

      expect(processed[0].markdown).toBe("# Custom Markdown");
    });

    it("generates markdown if not present", () => {
      const results = [
        {
          url: "https://example.com",
          title: "Title",
          description: "Description",
        },
      ];

      const processed = processResults(results);

      expect(processed[0].markdown).toContain("### [Title]");
    });

    it("preserves original properties", () => {
      const results = [
        {
          url: "https://example.com",
          title: "Original Title",
          description: "Original Description",
        },
      ];

      const processed = processResults(results);

      expect(processed[0].url).toBe("https://example.com");
      expect(processed[0].title).toBe("Original Title");
      expect(processed[0].description).toBe("Original Description");
    });

    it("processes multiple results", () => {
      const results = [
        {
          url: "https://example1.com",
          title: "Title 1",
          description: "Description 1",
        },
        {
          url: "https://example2.com",
          title: "Title 2",
          description: "Description 2",
          content: "Some content",
        },
      ];

      const processed = processResults(results);

      expect(processed).toHaveLength(2);
      expect(processed[0].url).toBe("https://example1.com");
      expect(processed[1].content).toBe("Some content");
    });
  });
});

describe("createSearchTool", () => {
  const executionOptions = {
    toolCallId: "tool-call-1",
    messages: [],
    context: {},
  };

  const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
    typeof value === "object" && value !== null && Symbol.asyncIterator in value;

  it("calls onSearchSuccess once for successful searches", async () => {
    const mockedSearchWithFallback = vi.mocked(searchWithFallback);
    mockedSearchWithFallback.mockResolvedValueOnce([
      {
        url: "https://example.com",
        title: "Title",
        description: "Description",
      },
    ]);

    const onSearchSuccess = vi.fn<() => Promise<void>>();
    const tool = createSearchTool({ onSearchSuccess });

    if (!tool.execute) {
      throw new Error("Search tool execute handler is not defined");
    }

    const result = await tool.execute(
      { query: "test query", maxResults: SEARCH_CONFIG.maxResults, scrapeContent: true },
      executionOptions,
    );

    if (isAsyncIterable(result)) {
      throw new Error("Search tool returned async iterable unexpectedly");
    }

    expect(result.success).toBe(true);
    expect(onSearchSuccess).toHaveBeenCalledTimes(1);
  });

  it("does not call onSearchSuccess when search fails", async () => {
    const mockedSearchWithFallback = vi.mocked(searchWithFallback);
    mockedSearchWithFallback.mockRejectedValueOnce(new Error("provider down"));

    const onSearchSuccess = vi.fn<() => Promise<void>>();
    const tool = createSearchTool({ onSearchSuccess });

    if (!tool.execute) {
      throw new Error("Search tool execute handler is not defined");
    }

    const result = await tool.execute(
      { query: "test query", maxResults: SEARCH_CONFIG.maxResults, scrapeContent: true },
      executionOptions,
    );

    if (isAsyncIterable(result)) {
      throw new Error("Search tool returned async iterable unexpectedly");
    }

    expect(result.success).toBe(false);
    expect(onSearchSuccess).not.toHaveBeenCalled();
  });

  it("fails closed when onSearchSuccess throws", async () => {
    const mockedSearchWithFallback = vi.mocked(searchWithFallback);
    mockedSearchWithFallback.mockResolvedValueOnce([
      {
        url: "https://example.com",
        title: "Title",
        description: "Description",
      },
    ]);

    const onSearchSuccess = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("billing failed"));
    const tool = createSearchTool({ onSearchSuccess });

    if (!tool.execute) {
      throw new Error("Search tool execute handler is not defined");
    }

    const result = await tool.execute(
      { query: "test query", maxResults: SEARCH_CONFIG.maxResults, scrapeContent: true },
      executionOptions,
    );

    if (isAsyncIterable(result)) {
      throw new Error("Search tool returned async iterable unexpectedly");
    }

    expect(result.success).toBe(false);
    expect(onSearchSuccess).toHaveBeenCalledTimes(1);
  });
});

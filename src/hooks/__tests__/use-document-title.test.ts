import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentTitle } from "../use-document-title";

// Mock the APP_NAME constant
vi.mock("@/lib/config", () => ({
  APP_NAME: "OpenChat",
}));

describe("useDocumentTitle", () => {
  let originalTitle: string;

  beforeEach(() => {
    originalTitle = document.title;
    document.title = "Initial Title";
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  it("sets document title to APP_NAME when no chatTitle provided", () => {
    renderHook(() => useDocumentTitle());

    expect(document.title).toBe("OpenChat");
  });

  it("sets document title with chat title when provided", () => {
    renderHook(() => useDocumentTitle("My Conversation"));

    expect(document.title).toBe("My Conversation - OpenChat");
  });

  it("updates document title when chatTitle changes", () => {
    const { rerender } = renderHook(({ chatTitle }) => useDocumentTitle(chatTitle), {
      initialProps: { chatTitle: "First Chat" },
    });

    expect(document.title).toBe("First Chat - OpenChat");

    rerender({ chatTitle: "Second Chat" });

    expect(document.title).toBe("Second Chat - OpenChat");
  });

  it("resets to APP_NAME when chatTitle becomes undefined", () => {
    const initialProps: { chatTitle: string | undefined } = { chatTitle: "My Chat" };
    const { rerender } = renderHook(({ chatTitle }) => useDocumentTitle(chatTitle), {
      initialProps,
    });

    expect(document.title).toBe("My Chat - OpenChat");

    rerender({ chatTitle: undefined });

    expect(document.title).toBe("OpenChat");
  });

  it("handles empty chatTitle string", () => {
    renderHook(() => useDocumentTitle(""));

    expect(document.title).toBe("OpenChat");
  });

  it("handles chatTitle with special characters", () => {
    renderHook(() => useDocumentTitle("Hello <World> & 'Test'"));

    expect(document.title).toBe("Hello <World> & 'Test' - OpenChat");
  });

  it("handles long chatTitle", () => {
    const longTitle = "A".repeat(200);
    renderHook(() => useDocumentTitle(longTitle));

    expect(document.title).toBe(`${longTitle} - OpenChat`);
  });

  it("does not update title when value is the same", () => {
    const { rerender } = renderHook(({ chatTitle }) => useDocumentTitle(chatTitle), {
      initialProps: { chatTitle: "Same Title" },
    });

    const titleAfterFirstRender = document.title;
    expect(titleAfterFirstRender).toBe("Same Title - OpenChat");

    // Rerender with same title
    rerender({ chatTitle: "Same Title" });

    expect(document.title).toBe(titleAfterFirstRender);
  });

  it("resets title on unmount when chatId is undefined", () => {
    const { unmount } = renderHook(() => useDocumentTitle("Chat Title", undefined));

    expect(document.title).toBe("Chat Title - OpenChat");

    unmount();

    // Without chatId, title should reset to APP_NAME
    expect(document.title).toBe("OpenChat");
  });

  it("does not reset title on unmount when chatId is provided", () => {
    const { unmount } = renderHook(() => useDocumentTitle("Chat Title", "chat-123"));

    expect(document.title).toBe("Chat Title - OpenChat");

    unmount();

    // With chatId, title should remain unchanged (prevents flicker between chats)
    expect(document.title).toBe("Chat Title - OpenChat");
  });
});

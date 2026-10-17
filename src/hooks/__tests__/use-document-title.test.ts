import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { APP_NAME } from "@/lib/config/constants";

import { useDocumentTitle } from "../use-document-title";

describe(useDocumentTitle, () => {
  let originalTitle: string;

  beforeEach(() => {
    originalTitle = document.title;
    document.title = "Initial Title";
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  it("sets document title to APP_NAME when no chatTitle provided", () => {
    renderHook(() => {
      useDocumentTitle();
    });

    expect(document.title).toBe(APP_NAME);
  });

  it("sets document title with chat title when provided", () => {
    renderHook(() => {
      useDocumentTitle("My Conversation");
    });

    expect(document.title).toBe(`My Conversation - ${APP_NAME}`);
  });

  it("updates document title when chatTitle changes", () => {
    const { rerender } = renderHook(
      ({ chatTitle }) => {
        useDocumentTitle(chatTitle);
      },
      {
        initialProps: { chatTitle: "First Chat" },
      }
    );

    expect(document.title).toBe(`First Chat - ${APP_NAME}`);

    rerender({ chatTitle: "Second Chat" });

    expect(document.title).toBe(`Second Chat - ${APP_NAME}`);
  });

  it("resets to APP_NAME when chatTitle becomes undefined", () => {
    const initialProps: { chatTitle: string | undefined } = {
      chatTitle: "My Chat",
    };
    const { rerender } = renderHook(
      ({ chatTitle }) => {
        useDocumentTitle(chatTitle);
      },
      {
        initialProps,
      }
    );

    expect(document.title).toBe(`My Chat - ${APP_NAME}`);

    rerender({ chatTitle: undefined });

    expect(document.title).toBe(APP_NAME);
  });

  it("handles empty chatTitle string", () => {
    renderHook(() => {
      useDocumentTitle("");
    });

    expect(document.title).toBe(APP_NAME);
  });

  it("handles chatTitle with special characters", () => {
    renderHook(() => {
      useDocumentTitle("Hello <World> & 'Test'");
    });

    expect(document.title).toBe(`Hello <World> & 'Test' - ${APP_NAME}`);
  });

  it("handles long chatTitle", () => {
    const longTitle = "A".repeat(200);
    renderHook(() => {
      useDocumentTitle(longTitle);
    });

    expect(document.title).toBe(`${longTitle} - ${APP_NAME}`);
  });

  it("does not update title when value is the same", () => {
    const { rerender } = renderHook(
      ({ chatTitle }) => {
        useDocumentTitle(chatTitle);
      },
      {
        initialProps: { chatTitle: "Same Title" },
      }
    );

    const titleAfterFirstRender = document.title;
    expect(titleAfterFirstRender).toBe(`Same Title - ${APP_NAME}`);

    // Rerender with same title
    rerender({ chatTitle: "Same Title" });

    expect(document.title).toBe(titleAfterFirstRender);
  });

  it("resets title on unmount when chatId is undefined", () => {
    const { unmount } = renderHook(() => {
      useDocumentTitle("Chat Title");
    });

    expect(document.title).toBe(`Chat Title - ${APP_NAME}`);

    unmount();

    // Without chatId, title should reset to APP_NAME
    expect(document.title).toBe(APP_NAME);
  });

  it("does not reset title on unmount when chatId is provided", () => {
    const { unmount } = renderHook(() => {
      useDocumentTitle("Chat Title", "chat-123");
    });

    expect(document.title).toBe(`Chat Title - ${APP_NAME}`);

    unmount();

    // With chatId, title should remain unchanged (prevents flicker between chats)
    expect(document.title).toBe(`Chat Title - ${APP_NAME}`);
  });
});

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBreakpoint } from "../use-breakpoint";

type ChangeListener = (event: string, callback: () => void) => void;

describe("useBreakpoint", () => {
  let mediaQueryListeners: Map<string, (() => void)[]>;

  beforeEach(() => {
    mediaQueryListeners = new Map();

    // Mock matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn<(query: string) => object>().mockImplementation((query) => {
        const listeners: (() => void)[] = [];
        mediaQueryListeners.set(query, listeners);

        return {
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn<(callback: () => void) => void>(),
          removeListener: vi.fn<(callback: () => void) => void>(),
          addEventListener: vi.fn<ChangeListener>((_event, callback) => {
            listeners.push(callback);
          }),
          removeEventListener: vi.fn<ChangeListener>(),
          dispatchEvent: vi.fn<(event: Event) => boolean>(),
        };
      }),
    });
  });

  it("returns false when window width is greater than breakpoint", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });

    const { result } = renderHook(() => useBreakpoint(768));

    expect(result.current).toBe(false);
  });

  it("returns true when window width is less than breakpoint", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 500,
    });

    const { result } = renderHook(() => useBreakpoint(768));

    expect(result.current).toBe(true);
  });

  it("returns false when window width equals breakpoint", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 768,
    });

    const { result } = renderHook(() => useBreakpoint(768));

    expect(result.current).toBe(false);
  });

  it("updates when breakpoint prop changes", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 600,
    });

    const { result, rerender } = renderHook(({ breakpoint }) => useBreakpoint(breakpoint), {
      initialProps: { breakpoint: 500 },
    });

    // 600 > 500, so should be false
    expect(result.current).toBe(false);

    // Change breakpoint to 700
    rerender({ breakpoint: 700 });

    // 600 < 700, so should be true
    expect(result.current).toBe(true);
  });

  it("responds to window resize events", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });

    const { result } = renderHook(() => useBreakpoint(768));

    expect(result.current).toBe(false);

    // Simulate resize
    act(() => {
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 500,
      });

      // Trigger the media query change listener
      const listeners = mediaQueryListeners.get("(max-width: 767px)");
      if (listeners) {
        for (const listener of listeners) {
          listener();
        }
      }
    });

    expect(result.current).toBe(true);
  });

  it("handles different breakpoint values", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 400,
    });

    // Test with mobile breakpoint
    const { result: mobileResult } = renderHook(() => useBreakpoint(480));
    expect(mobileResult.current).toBe(true);

    // Test with tablet breakpoint
    const { result: tabletResult } = renderHook(() => useBreakpoint(768));
    expect(tabletResult.current).toBe(true);

    // Test with desktop breakpoint
    const { result: desktopResult } = renderHook(() => useBreakpoint(1024));
    expect(desktopResult.current).toBe(true);
  });

  it("cleans up event listener on unmount", () => {
    const removeEventListenerMock = vi.fn<ChangeListener>();

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn<(query: string) => object>().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn<ChangeListener>(),
        removeEventListener: removeEventListenerMock,
        dispatchEvent: vi.fn<(event: Event) => boolean>(),
      })),
    });

    const { unmount } = renderHook(() => useBreakpoint(768));

    unmount();

    expect(removeEventListenerMock).toHaveBeenCalledWith("change", expect.any(Function));
  });
});

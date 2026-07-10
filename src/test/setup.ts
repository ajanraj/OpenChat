import { vi } from "vitest";

// Mock window.matchMedia for tests that use theme detection
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn<typeof window.matchMedia>().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn<MediaQueryList["addListener"]>(),
    removeListener: vi.fn<MediaQueryList["removeListener"]>(),
    addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
    removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
    dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(() => false),
  })),
});

// Mock localStorage for tests that use zustand persist
const localStorageMock = {
  getItem: vi.fn<Storage["getItem"]>(),
  setItem: vi.fn<Storage["setItem"]>(),
  removeItem: vi.fn<Storage["removeItem"]>(),
  clear: vi.fn<Storage["clear"]>(),
  length: 0,
  key: vi.fn<Storage["key"]>(),
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {
    // Mock implementation - no-op
  }
  unobserve() {
    // Mock implementation - no-op
  }
  disconnect() {
    // Mock implementation - no-op
  }
}
window.ResizeObserver = ResizeObserverMock;

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe() {
    // Mock implementation - no-op
  }
  unobserve() {
    // Mock implementation - no-op
  }
  disconnect() {
    // Mock implementation - no-op
  }
}
window.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;

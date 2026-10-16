import { vi } from "vitest";

// Mock window.matchMedia for tests that use theme detection
Object.defineProperty(window, "matchMedia", {
  writable: true,
  // Without the deprecated addListener/removeListener, which the app doesn't use
  value: vi.fn<
    (query: string) => Omit<MediaQueryList, "addListener" | "removeListener">
  >((query) => ({
    matches: false,
    media: query,
    onchange: null,
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

const noop = () => {
  // No-op
};
const noRecords = (): IntersectionObserverEntry[] => [];

/** No-op stand-in for the observers jsdom lacks: ResizeObserver and IntersectionObserver. */
class ObserverMock implements IntersectionObserver, ResizeObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds: readonly number[] = [];
  observe = noop;
  unobserve = noop;
  disconnect = noop;
  takeRecords = noRecords;
}
window.ResizeObserver = ObserverMock;
window.IntersectionObserver = ObserverMock;

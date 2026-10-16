import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../editor-store";

describe("useEditorStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset the store to its initial state
    useEditorStore.setState({
      themeState: useEditorStore.getState().themeState,
      themeCheckpoint: null,
      history: [],
      future: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("has a default themeState", () => {
      const state = useEditorStore.getState();
      expect(state.themeState).toBeDefined();
      expect(state.themeState.styles).toBeDefined();
      expect(state.themeState.styles.light).toBeDefined();
      expect(state.themeState.styles.dark).toBeDefined();
    });

    it("has null themeCheckpoint initially", () => {
      const state = useEditorStore.getState();
      expect(state.themeCheckpoint).toBeNull();
    });

    it("has empty history initially", () => {
      const state = useEditorStore.getState();
      expect(state.history).toEqual([]);
    });

    it("has empty future initially", () => {
      const state = useEditorStore.getState();
      expect(state.future).toEqual([]);
    });
  });

  describe("setThemeState", () => {
    it("updates themeState", () => {
      const { setThemeState, themeState } = useEditorStore.getState();
      const newState = {
        ...themeState,
        preset: "new-preset",
      };

      setThemeState(newState);

      expect(useEditorStore.getState().themeState.preset).toBe("new-preset");
    });

    it("adds to history when updating themeState", () => {
      const { setThemeState, themeState } = useEditorStore.getState();

      // Advance time past the history threshold
      vi.advanceTimersByTime(600);

      const newState = {
        ...themeState,
        preset: "modified-preset",
      };

      setThemeState(newState);

      const state = useEditorStore.getState();
      expect(state.history.length).toBeGreaterThan(0);
    });

    it("does not add to history when only currentMode changes", () => {
      const { setThemeState, themeState } = useEditorStore.getState();

      // Change only currentMode
      const newMode: "light" | "dark" = themeState.currentMode === "light" ? "dark" : "light";
      const newState = {
        ...themeState,
        currentMode: newMode,
      };

      setThemeState(newState);

      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(0);
    });
  });

  describe("saveThemeCheckpoint and restoreThemeCheckpoint", () => {
    it("saveThemeCheckpoint saves current state", () => {
      const { saveThemeCheckpoint, themeState } = useEditorStore.getState();

      saveThemeCheckpoint();

      const state = useEditorStore.getState();
      expect(state.themeCheckpoint).toEqual(themeState);
    });

    it("restoreThemeCheckpoint restores saved state", () => {
      const store = useEditorStore.getState();
      const originalState = { ...store.themeState };

      // Save checkpoint
      store.saveThemeCheckpoint();

      // Advance time and modify state
      vi.advanceTimersByTime(600);

      store.setThemeState({
        ...store.themeState,
        preset: "modified",
      });

      // Verify state changed
      expect(useEditorStore.getState().themeState.preset).toBe("modified");

      // Restore checkpoint
      useEditorStore.getState().restoreThemeCheckpoint();

      // Verify restored (except currentMode which is preserved)
      const restoredState = useEditorStore.getState().themeState;
      expect(restoredState.preset).toBe(originalState.preset);
    });

    it("restoreThemeCheckpoint does nothing if no checkpoint", () => {
      const store = useEditorStore.getState();
      const originalState = { ...store.themeState };

      // No checkpoint saved, try to restore
      store.restoreThemeCheckpoint();

      // State should remain unchanged
      expect(useEditorStore.getState().themeState).toEqual(originalState);
    });
  });

  describe("hasThemeChangedFromCheckpoint", () => {
    it("returns false when no checkpoint exists", () => {
      const { hasThemeChangedFromCheckpoint } = useEditorStore.getState();
      expect(hasThemeChangedFromCheckpoint()).toBe(false);
    });

    it("returns false when state equals checkpoint", () => {
      const store = useEditorStore.getState();
      store.saveThemeCheckpoint();

      expect(useEditorStore.getState().hasThemeChangedFromCheckpoint()).toBe(false);
    });

    it("returns true when state differs from checkpoint", () => {
      const store = useEditorStore.getState();
      store.saveThemeCheckpoint();

      // Advance time and modify
      vi.advanceTimersByTime(600);

      store.setThemeState({
        ...store.themeState,
        preset: "different",
      });

      expect(useEditorStore.getState().hasThemeChangedFromCheckpoint()).toBe(true);
    });
  });

  describe("canUndo and canRedo", () => {
    it("canUndo returns false initially", () => {
      const { canUndo } = useEditorStore.getState();
      expect(canUndo()).toBe(false);
    });

    it("canRedo returns false initially", () => {
      const { canRedo } = useEditorStore.getState();
      expect(canRedo()).toBe(false);
    });

    it("canUndo returns true after state change", () => {
      const store = useEditorStore.getState();

      vi.advanceTimersByTime(600);

      store.setThemeState({
        ...store.themeState,
        preset: "changed",
      });

      expect(useEditorStore.getState().canUndo()).toBe(true);
    });
  });

  describe("undo and redo", () => {
    it("undo does nothing when history is empty", () => {
      const { undo, themeState } = useEditorStore.getState();
      const originalPreset = themeState.preset;

      undo();

      expect(useEditorStore.getState().themeState.preset).toBe(originalPreset);
    });

    it("redo does nothing when future is empty", () => {
      const { redo, themeState } = useEditorStore.getState();
      const originalPreset = themeState.preset;

      redo();

      expect(useEditorStore.getState().themeState.preset).toBe(originalPreset);
    });

    it("undo reverts to previous state", () => {
      const store = useEditorStore.getState();
      const originalPreset = store.themeState.preset;

      vi.advanceTimersByTime(600);

      store.setThemeState({
        ...store.themeState,
        preset: "changed",
      });

      expect(useEditorStore.getState().themeState.preset).toBe("changed");

      useEditorStore.getState().undo();

      expect(useEditorStore.getState().themeState.preset).toBe(originalPreset);
    });

    it("redo restores undone state", () => {
      const store = useEditorStore.getState();

      vi.advanceTimersByTime(600);

      store.setThemeState({
        ...store.themeState,
        preset: "changed",
      });

      useEditorStore.getState().undo();
      useEditorStore.getState().redo();

      expect(useEditorStore.getState().themeState.preset).toBe("changed");
    });

    it("canRedo returns true after undo", () => {
      const store = useEditorStore.getState();

      vi.advanceTimersByTime(600);

      store.setThemeState({
        ...store.themeState,
        preset: "changed",
      });

      useEditorStore.getState().undo();

      expect(useEditorStore.getState().canRedo()).toBe(true);
    });
  });

  describe("resetToCurrentPreset", () => {
    it("resets styles to preset defaults", () => {
      const store = useEditorStore.getState();

      vi.advanceTimersByTime(600);

      // Modify styles
      store.setThemeState({
        ...store.themeState,
        hslAdjustments: {
          hueShift: 50,
          saturationScale: 1.5,
          lightnessScale: 0.8,
        },
      });

      useEditorStore.getState().resetToCurrentPreset();

      const state = useEditorStore.getState();
      expect(state.themeState.hslAdjustments).toEqual({
        hueShift: 0,
        saturationScale: 1,
        lightnessScale: 1,
      });
    });

    it("clears history and future", () => {
      const store = useEditorStore.getState();

      vi.advanceTimersByTime(600);

      store.setThemeState({
        ...store.themeState,
        preset: "changed",
      });

      useEditorStore.getState().resetToCurrentPreset();

      const state = useEditorStore.getState();
      expect(state.history).toEqual([]);
      expect(state.future).toEqual([]);
    });
  });
});

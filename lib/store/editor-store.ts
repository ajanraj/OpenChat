import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultThemeState } from "../config/theme";
import type { FontCategory, FontOption } from "../theme/theme-fonts";
import { hasCustomFonts, updateThemeFont } from "../theme/theme-fonts";
import { getPresetThemeStyles } from "../theme/theme-preset-helper";
import type { ThemeEditorState } from "../types/theme";
import { isDeepEqual } from "../utils";

const MAX_HISTORY_COUNT = 30;
const HISTORY_OVERRIDE_THRESHOLD_MS = 500; // 0.5 seconds

type ThemeHistoryEntry = {
  state: ThemeEditorState;
  timestamp: number;
};

type EditorStore = {
  themeState: ThemeEditorState;
  themeCheckpoint: ThemeEditorState | null;
  history: ThemeHistoryEntry[];
  future: ThemeHistoryEntry[];
  setThemeState: (state: ThemeEditorState) => void;
  applyThemePreset: (preset: string) => void;
  updateFont: (category: FontCategory, fontOption: FontOption) => void;
  saveThemeCheckpoint: () => void;
  restoreThemeCheckpoint: () => void;
  resetToCurrentPreset: () => void;
  hasThemeChangedFromCheckpoint: () => boolean;
  hasUnsavedChanges: () => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

// Helper function to safely detect system preference on client-side only
const getSystemPreference = (): "light" | "dark" => {
  if (typeof window === "undefined") {
    return "light"; // Safe server-side default
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      themeState: defaultThemeState,
      themeCheckpoint: null,
      history: [],
      future: [],
      setThemeState: (newState: ThemeEditorState) => {
        const oldThemeState = get().themeState;
        let currentHistory = get().history;
        let currentFuture = get().future;

        // Check if only currentMode changed
        const oldStateWithoutMode = {
          ...oldThemeState,
          currentMode: undefined,
        };
        const newStateWithoutMode = { ...newState, currentMode: undefined };

        if (
          isDeepEqual(oldStateWithoutMode, newStateWithoutMode) &&
          oldThemeState.currentMode !== newState.currentMode
        ) {
          // Only currentMode changed
          // Just update themeState without affecting history or future
          set({ themeState: newState });
          return;
        }

        const currentTime = Date.now();

        // If other things changed, or if it's an actual identical state set (though less likely here)
        // Proceed with history logic
        const lastHistoryEntry =
          currentHistory.length > 0 ? currentHistory.at(-1) : null;

        if (
          !lastHistoryEntry ||
          currentTime - lastHistoryEntry.timestamp >=
            HISTORY_OVERRIDE_THRESHOLD_MS
        ) {
          // Add a new history entry
          currentHistory = [
            ...currentHistory,
            { state: oldThemeState, timestamp: currentTime },
          ];
          currentFuture = [];
        }

        if (currentHistory.length > MAX_HISTORY_COUNT) {
          currentHistory.shift(); // Remove the oldest entry
        }

        set({
          themeState: newState,
          history: currentHistory,
          future: currentFuture,
        });
      },
      applyThemePreset: (preset: string) => {
        const currentThemeState = get().themeState;
        const oldHistory = get().history;
        const currentTime = Date.now();

        const newStyles = getPresetThemeStyles(preset);
        const newThemeState: ThemeEditorState = {
          ...currentThemeState,
          preset,
          styles: newStyles,
          hslAdjustments: defaultThemeState.hslAdjustments,
        };

        const newHistoryEntry = {
          state: currentThemeState,
          timestamp: currentTime,
        };
        const updatedHistory = [...oldHistory, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory.shift();
        }

        set({
          themeState: newThemeState,
          themeCheckpoint: newThemeState, // Applying a preset also updates the checkpoint
          history: updatedHistory,
          future: [],
        });
      },
      updateFont: (category: FontCategory, fontOption: FontOption) => {
        const currentThemeState = get().themeState;
        // Fonts (and other COMMON_STYLES) are intended to be shared between modes.
        // Original implementation only updated the current mode which meant
        // switching fonts while in dark mode would NOT reflect globally because
        // applyThemeToElement always reads common style vars from the LIGHT mode
        // (see applyCommonStyles usage). To keep a single source of truth we
        // update both light & dark styles when a font changes.

        const updatedLightStyles = {
          ...currentThemeState.styles.light,
          ...updateThemeFont(
            currentThemeState.styles.light,
            category,
            fontOption
          ),
        } as typeof currentThemeState.styles.light;
        const updatedDarkStyles = {
          ...currentThemeState.styles.dark,
          ...updateThemeFont(
            currentThemeState.styles.dark,
            category,
            fontOption
          ),
        } as typeof currentThemeState.styles.dark;

        // Determine custom font usage based on (updated) light styles
        const shouldMarkAsCustom = hasCustomFonts(updatedLightStyles);
        const preset = shouldMarkAsCustom
          ? undefined
          : currentThemeState.preset;

        const newThemeState: ThemeEditorState = {
          ...currentThemeState,
          preset,
          styles: {
            ...currentThemeState.styles,
            light: updatedLightStyles,
            dark: updatedDarkStyles,
          },
        };

        get().setThemeState(newThemeState);
      },
      saveThemeCheckpoint: () => {
        set({ themeCheckpoint: get().themeState });
      },
      restoreThemeCheckpoint: () => {
        const checkpoint = get().themeCheckpoint;
        if (checkpoint) {
          const oldThemeState = get().themeState;
          const oldHistory = get().history;
          const currentTime = Date.now();

          const newHistoryEntry = {
            state: oldThemeState,
            timestamp: currentTime,
          };
          const updatedHistory = [...oldHistory, newHistoryEntry];
          if (updatedHistory.length > MAX_HISTORY_COUNT) {
            updatedHistory.shift();
          }

          set({
            themeState: {
              ...checkpoint,
              currentMode: get().themeState.currentMode,
            },
            history: updatedHistory,
            future: [],
          });
        } else {
          // No theme checkpoint available to restore to
        }
      },
      hasThemeChangedFromCheckpoint: () => {
        const checkpoint = get().themeCheckpoint;
        // If no checkpoint exists, there are no changes to compare against
        if (!checkpoint) {
          return false;
        }
        return !isDeepEqual(get().themeState, checkpoint);
      },
      hasUnsavedChanges: () => {
        const themeState = get().themeState;
        const presetThemeStyles = getPresetThemeStyles(
          themeState.preset ?? "oschat"
        );
        const stylesChanged = !isDeepEqual(
          themeState.styles,
          presetThemeStyles
        );
        const hslChanged = !isDeepEqual(
          themeState.hslAdjustments,
          defaultThemeState.hslAdjustments
        );
        return stylesChanged || hslChanged;
      },
      resetToCurrentPreset: () => {
        const currentThemeState = get().themeState;

        const presetThemeStyles = getPresetThemeStyles(
          currentThemeState.preset ?? "oschat"
        );
        const newThemeState: ThemeEditorState = {
          ...currentThemeState,
          styles: presetThemeStyles,
          hslAdjustments: defaultThemeState.hslAdjustments,
        };

        set({
          themeState: newThemeState,
          themeCheckpoint: newThemeState,
          history: [],
          future: [],
        });
      },
      undo: () => {
        const history = get().history;
        if (history.length === 0) {
          return;
        }

        const currentThemeState = get().themeState;
        const future = get().future;

        const lastHistoryEntry = history.at(-1);
        if (!lastHistoryEntry) {
          return;
        }

        const newHistory = history.slice(0, -1);

        const newFutureEntry = {
          state: currentThemeState,
          timestamp: Date.now(),
        };
        const newFuture = [newFutureEntry, ...future];

        set({
          themeState: {
            ...lastHistoryEntry.state,
            currentMode: currentThemeState.currentMode,
          },
          themeCheckpoint: lastHistoryEntry.state,
          history: newHistory,
          future: newFuture,
        });
      },
      redo: () => {
        const future = get().future;
        if (future.length === 0) {
          return;
        }
        const history = get().history;

        const firstFutureEntry = future[0];
        const newFuture = future.slice(1);

        const currentThemeState = get().themeState;

        const newHistoryEntry = {
          state: currentThemeState,
          timestamp: Date.now(),
        };
        const updatedHistory = [...history, newHistoryEntry];
        if (updatedHistory.length > MAX_HISTORY_COUNT) {
          updatedHistory.shift();
        }

        set({
          themeState: {
            ...firstFutureEntry.state,
            currentMode: currentThemeState.currentMode,
          },
          themeCheckpoint: firstFutureEntry.state,
          history: updatedHistory,
          future: newFuture,
        });
      },
      canUndo: () => get().history.length > 0,
      canRedo: () => get().future.length > 0,
    }),
    {
      name: "editor-storage",
      onRehydrateStorage: () => (state) => {
        // Only run on client-side after hydration
        if (state && typeof window !== "undefined") {
          // If no theme state exists in storage (first visit), detect system preference
          const hasStoredTheme = localStorage.getItem("editor-storage");
          if (!hasStoredTheme) {
            const systemPreference = getSystemPreference();
            state.themeState = {
              ...state.themeState,
              currentMode: systemPreference,
            };
          }
        }
      },
    }
  )
);

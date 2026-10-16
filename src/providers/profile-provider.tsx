import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useEditorStore } from "../lib/store/editor-store";
import type { ThemeEditorState } from "../lib/types/theme";
import { useUser } from "./user-provider";

export type Profile = Doc<"profiles">;

interface PendingProfileSwitch {
  profileId: Id<"profiles">;
  currentChatId?: string | null;
}

interface ProfileContextType {
  profiles: Profile[];
  activeProfile: Profile | undefined;
  /**
   * The profile whose chats the chat lists show: the active profile, or the user's stored active
   * profile id until profiles load (anonymous users never load them). Null while an anonymous user
   * has no profile, or for a signed-out visitor (so no chats yet); undefined while unknown.
   */
  chatListProfileId: Id<"profiles"> | null | undefined;
  setActiveProfile: (
    profileId: Id<"profiles">,
    currentChatId?: string | null
  ) => void;
  isProfilesLoading: boolean;
  slideDirection: number;
  getLastChatForProfile: (profileId: Id<"profiles">) => string | null;
  pendingSwitch: PendingProfileSwitch | null;
  executePendingSwitch: () => void;
  clearPendingSwitch: () => void;
  registerBeforeProfileSwitch: (fn: () => boolean) => void;
  unregisterBeforeProfileSwitch: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const THEME_SAVE_DEBOUNCE_MS = 1000;

// Structural check for a stored theme config; anything else is treated like unparseable JSON
const isThemeEditorState = (value: unknown): value is ThemeEditorState =>
  typeof value === "object" &&
  value !== null &&
  "styles" in value &&
  typeof value.styles === "object" &&
  value.styles !== null &&
  "currentMode" in value &&
  (value.currentMode === "light" || value.currentMode === "dark");

// Parses a profile's stored theme config, returning null when it is invalid
const parseThemeConfig = (themeConfig: string): ThemeEditorState | null => {
  try {
    const parsed: unknown = JSON.parse(themeConfig);
    return isThemeEditorState(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const ProfileProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user, isLoading: isUserLoading } = useUser();
  const ensureDefault = useMutation(api.profiles.ensureDefaultProfile);
  const setActive = useMutation(api.profiles.setActiveProfile);
  const updateProfileMut = useMutation(api.profiles.updateProfile);
  const setThemeState = useEditorStore((s) => s.setThemeState);
  const themeState = useEditorStore((s) => s.themeState);
  const defaultProfileInitInFlightRef = useRef(false);
  const themeStateRef = useRef(themeState);
  const updateProfileMutRef = useRef(updateProfileMut);

  // Sync refs after render so React Compiler can optimize (refs must not be written during render)
  useEffect(() => {
    themeStateRef.current = themeState;
    updateProfileMutRef.current = updateProfileMut;
  });

  const { data: profiles = [], isLoading } = useTanStackQuery({
    ...convexQuery(
      api.profiles.listProfiles,
      user && user.isAnonymous !== true ? {} : "skip"
    ),
    enabled: Boolean(user) && user?.isAnonymous !== true,
    // Dropped with its account, so a later session waits for its own instead of showing these
    gcTime: 0,
  });

  // Lazy init: ensure default profile exists on first load
  useEffect(() => {
    if (!user || user.isAnonymous === true || isLoading) {
      defaultProfileInitInFlightRef.current = false;
      return;
    }

    if (profiles.length > 0) {
      defaultProfileInitInFlightRef.current = false;
      return;
    }

    if (defaultProfileInitInFlightRef.current) {
      return;
    }

    defaultProfileInitInFlightRef.current = true;
    const ensureDefaultProfile = async () => {
      try {
        await ensureDefault({
          themeConfig: JSON.stringify(themeStateRef.current),
        });
      } catch {
        defaultProfileInitInFlightRef.current = false;
      }
    };
    void ensureDefaultProfile();
  }, [user, isLoading, profiles.length, ensureDefault]);

  const [optimisticActiveProfileId, setOptimisticActiveProfileId] =
    useState<Id<"profiles">>();

  // Drop the optimistic profile once the server confirms it or the user signs out
  // (adjusting state during render instead of in an effect).
  if (
    optimisticActiveProfileId &&
    (!user ||
      user.isAnonymous === true ||
      user.activeProfileId === optimisticActiveProfileId)
  ) {
    setOptimisticActiveProfileId(undefined);
  }
  const activeProfileId = optimisticActiveProfileId ?? user?.activeProfileId;

  const activeProfile = useMemo(() => {
    if (!activeProfileId || profiles.length === 0) {
      return profiles.find((p) => p.isDefault);
    }
    return (
      profiles.find((p) => p._id === activeProfileId) ??
      profiles.find((p) => p.isDefault)
    );
  }, [activeProfileId, profiles]);
  // The stored id lets chats load alongside the profiles (anonymous users never load profiles; their
  // first chat creates a default profile and makes it active)
  const hasNoProfile = user ? user.isAnonymous === true : !isUserLoading;
  const chatListProfileId =
    activeProfile?._id ?? activeProfileId ?? (hasNoProfile ? null : undefined);

  // Apply theme config when active profile changes
  const prevProfileIdRef = useRef<Id<"profiles"> | null>(null);
  const themeSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedThemeRef = useRef<string>("");
  // Tracks whether a theme edit is pending flush (survives debounce-effect cleanup)
  const pendingThemeSaveRef = useRef(false);

  // Cancels the scheduled debounced theme save, if any
  const cancelThemeSaveTimer = useCallback(() => {
    if (themeSaveTimerRef.current !== null) {
      clearTimeout(themeSaveTimerRef.current);
      themeSaveTimerRef.current = null;
    }
  }, []);

  // Saves a theme edit still waiting on its debounce to the profile it was made for, right away.
  // Best-effort: a session that has already ended can't save it.
  const flushPendingThemeSave = useCallback(
    (profileId: Id<"profiles"> | null) => {
      if (!pendingThemeSaveRef.current) {
        return;
      }
      cancelThemeSaveTimer();
      pendingThemeSaveRef.current = false;
      const serialized = JSON.stringify(themeStateRef.current);
      if (profileId !== null && serialized !== lastSavedThemeRef.current) {
        const save = async () => {
          try {
            await updateProfileMutRef.current({
              profileId,
              updates: { themeConfig: serialized },
            });
          } catch {
            // Best-effort: the edit is dropped if this save fails
          }
        };
        void save();
      }
    },
    [cancelThemeSaveTimer]
  );

  useEffect(() => {
    if (!activeProfile || activeProfile._id === prevProfileIdRef.current) {
      return;
    }
    const previousProfileId = prevProfileIdRef.current;
    prevProfileIdRef.current = activeProfile._id;

    // Flush any pending theme save for the previous profile before switching
    flushPendingThemeSave(previousProfileId);

    const { themeConfig } = activeProfile;
    if (themeConfig !== undefined && themeConfig !== "") {
      const parsed = parseThemeConfig(themeConfig);
      if (parsed) {
        setThemeState(parsed);
        // Track what we applied so debounce won't re-save the same value
        lastSavedThemeRef.current = themeConfig;
      } else {
        // Invalid theme config — snapshot current state to prevent stale save
        lastSavedThemeRef.current = JSON.stringify(
          useEditorStore.getState().themeState
        );
      }
    } else {
      // No theme config on this profile — snapshot current Zustand state
      // so the debounce doesn't save the previous profile's theme here
      lastSavedThemeRef.current = JSON.stringify(
        useEditorStore.getState().themeState
      );
    }
  }, [activeProfile, setThemeState, flushPendingThemeSave]);

  // Debounced theme config save to Convex
  useEffect(() => {
    const serialized = JSON.stringify(themeState);
    if (activeProfile && serialized !== lastSavedThemeRef.current) {
      cancelThemeSaveTimer();

      // Capture the profile ID at scheduling time to guard against profile switches
      const targetProfileId = activeProfile._id;

      const saveThemeConfig = async () => {
        try {
          await updateProfileMut({
            profileId: targetProfileId,
            updates: { themeConfig: serialized },
          });
          // Only update ref if still on the same profile
          if (prevProfileIdRef.current === targetProfileId) {
            lastSavedThemeRef.current = serialized;
          }
        } catch {
          // Reset so next render retries the save
          if (prevProfileIdRef.current === targetProfileId) {
            lastSavedThemeRef.current = "";
          }
        }
      };

      pendingThemeSaveRef.current = true;
      themeSaveTimerRef.current = setTimeout(() => {
        pendingThemeSaveRef.current = false;
        themeSaveTimerRef.current = null;

        // Abort if the active profile has changed since we scheduled
        if (prevProfileIdRef.current !== targetProfileId) {
          return;
        }

        void saveThemeConfig();
      }, THEME_SAVE_DEBOUNCE_MS);
    }

    // Only cancel the timer; leave pendingThemeSaveRef.current intact so a profile
    // switch, or the account's session ending, can detect and flush the unsaved edit.
    return cancelThemeSaveTimer;
  }, [themeState, activeProfile, updateProfileMut, cancelThemeSaveTimer]);

  // Flush as the account's session ends and on true unmount. On sign-out (here or in another tab)
  // this cleanup runs before Convex drops the session's auth (its own cleanup comes later in the
  // tree), so the save still goes out as that account; a session whose token was already rejected
  // can't save. Nothing stays pending, or scheduled, for the next account.
  // Nothing can be pending while signed out (no profiles load), so only a session flushes.
  const userId = user?._id;
  useEffect(() => {
    const sessionUserId = userId;
    return () => {
      if (sessionUserId !== undefined) {
        flushPendingThemeSave(prevProfileIdRef.current);
      }
    };
  }, [userId, flushPendingThemeSave]);

  const [slideDirection, setSlideDirection] = useState(0);
  const chatByProfileRef = useRef<Map<string, string>>(new Map());
  const profileSwitchRequestRef = useRef(0);

  const getLastChatForProfile = useCallback(
    (profileId: Id<"profiles">) =>
      chatByProfileRef.current.get(profileId) ?? null,
    []
  );

  // --- Profile switch guard ---
  const beforeProfileSwitchRef = useRef<(() => boolean) | null>(null);
  const [pendingSwitch, setPendingSwitch] =
    useState<PendingProfileSwitch | null>(null);

  const executeSwitch = useCallback(
    (profileId: Id<"profiles">, currentChatId?: string | null) => {
      const previousActiveProfileId = activeProfile?._id;
      if (previousActiveProfileId === profileId) {
        return;
      }

      if (
        activeProfile &&
        currentChatId !== undefined &&
        currentChatId !== null &&
        currentChatId !== ""
      ) {
        chatByProfileRef.current.set(activeProfile._id, currentChatId);
      } else if (activeProfile && currentChatId === null) {
        chatByProfileRef.current.delete(activeProfile._id);
      }
      const currentIndex = profiles.findIndex(
        (p) => p._id === activeProfile?._id
      );
      const nextIndex = profiles.findIndex((p) => p._id === profileId);
      setSlideDirection(nextIndex > currentIndex ? 1 : -1);
      const requestId = profileSwitchRequestRef.current + 1;
      profileSwitchRequestRef.current = requestId;
      setOptimisticActiveProfileId(profileId);
      const persistActiveProfile = async () => {
        try {
          await setActive({ profileId });
        } catch {
          if (profileSwitchRequestRef.current !== requestId) {
            return;
          }
          // Clear optimistic state and fall back to server-authoritative user.activeProfileId.
          setOptimisticActiveProfileId(undefined);
        }
      };
      void persistActiveProfile();
    },
    [setActive, profiles, activeProfile]
  );

  const setActiveProfile = useCallback(
    (profileId: Id<"profiles">, currentChatId?: string | null) => {
      if (beforeProfileSwitchRef.current && !beforeProfileSwitchRef.current()) {
        setPendingSwitch({ profileId, currentChatId });
        return;
      }
      executeSwitch(profileId, currentChatId);
    },
    [executeSwitch]
  );

  const executePendingSwitch = useCallback(() => {
    if (!pendingSwitch) {
      return;
    }
    executeSwitch(pendingSwitch.profileId, pendingSwitch.currentChatId);
    setPendingSwitch(null);
  }, [pendingSwitch, executeSwitch]);

  const clearPendingSwitch = useCallback(() => {
    setPendingSwitch(null);
  }, []);

  const registerBeforeProfileSwitch = useCallback((fn: () => boolean) => {
    beforeProfileSwitchRef.current = fn;
  }, []);

  const unregisterBeforeProfileSwitch = useCallback(() => {
    beforeProfileSwitchRef.current = null;
  }, []);

  const contextValue = useMemo(
    () => ({
      profiles,
      activeProfile,
      chatListProfileId,
      setActiveProfile,
      isProfilesLoading: isLoading,
      slideDirection,
      getLastChatForProfile,
      pendingSwitch,
      executePendingSwitch,
      clearPendingSwitch,
      registerBeforeProfileSwitch,
      unregisterBeforeProfileSwitch,
    }),
    [
      profiles,
      activeProfile,
      chatListProfileId,
      setActiveProfile,
      isLoading,
      slideDirection,
      getLastChatForProfile,
      pendingSwitch,
      executePendingSwitch,
      clearPendingSwitch,
      registerBeforeProfileSwitch,
      unregisterBeforeProfileSwitch,
    ]
  );

  return (
    <ProfileContext.Provider value={contextValue}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
};

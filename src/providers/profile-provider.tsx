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

interface ProfileContextType {
  profiles: Profile[];
  activeProfile: Profile | undefined;
  setActiveProfile: (profileId: Id<"profiles">, currentChatId?: string | null) => void;
  isProfilesLoading: boolean;
  slideDirection: number;
  getLastChatForProfile: (profileId: Id<"profiles">) => string | null;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const THEME_SAVE_DEBOUNCE_MS = 1000;

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const ensureDefault = useMutation(api.profiles.ensureDefaultProfile);
  const setActive = useMutation(api.profiles.setActiveProfile);
  const updateProfileMut = useMutation(api.profiles.updateProfile);
  const setThemeState = useEditorStore((s) => s.setThemeState);
  const themeState = useEditorStore((s) => s.themeState);
  const defaultProfileInitInFlightRef = useRef(false);
  // Ref to capture themeState at call time without adding it as a dep
  const themeStateRef = useRef(themeState);
  useEffect(() => {
    themeStateRef.current = themeState;
  }, [themeState]);

  const { data: profiles = [], isLoading } = useTanStackQuery({
    ...convexQuery(api.profiles.listProfiles, user && !user.isAnonymous ? {} : "skip"),
    enabled: Boolean(user) && !user?.isAnonymous,
    gcTime: 10 * 60 * 1000,
  });

  // Lazy init: ensure default profile exists on first load
  useEffect(() => {
    if (!user || user.isAnonymous || isLoading) {
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
    void ensureDefault({
      themeConfig: JSON.stringify(themeStateRef.current),
    }).catch(() => {
      defaultProfileInitInFlightRef.current = false;
    });
  }, [user, isLoading, profiles.length, ensureDefault]);

  const activeProfileId = user?.activeProfileId;
  const activeProfile = useMemo(() => {
    if (!activeProfileId || profiles.length === 0) {
      return profiles.find((p) => p.isDefault);
    }
    return profiles.find((p) => p._id === activeProfileId) ?? profiles.find((p) => p.isDefault);
  }, [activeProfileId, profiles]);

  // Apply theme config when active profile changes
  const prevProfileIdRef = useRef<Id<"profiles"> | undefined>(undefined);
  const themeSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSavedThemeRef = useRef<string>("");
  // Tracks whether a theme edit is pending flush (survives debounce-effect cleanup)
  const pendingThemeSaveRef = useRef(false);

  useEffect(() => {
    if (!activeProfile || activeProfile._id === prevProfileIdRef.current) {
      return;
    }
    const previousProfileId = prevProfileIdRef.current;
    prevProfileIdRef.current = activeProfile._id;

    // Flush any pending theme save for the previous profile before switching
    if (pendingThemeSaveRef.current) {
      clearTimeout(themeSaveTimerRef.current);
      themeSaveTimerRef.current = undefined;
      pendingThemeSaveRef.current = false;

      if (previousProfileId) {
        const serialized = JSON.stringify(themeStateRef.current);
        if (serialized !== lastSavedThemeRef.current) {
          void updateProfileMut({
            profileId: previousProfileId,
            updates: { themeConfig: serialized },
          });
        }
      }
    }

    if (activeProfile.themeConfig) {
      try {
        const parsed = JSON.parse(activeProfile.themeConfig) as ThemeEditorState;
        setThemeState(parsed);
        // Track what we applied so debounce won't re-save the same value
        lastSavedThemeRef.current = activeProfile.themeConfig;
      } catch {
        // Invalid theme config — snapshot current state to prevent stale save
        lastSavedThemeRef.current = JSON.stringify(useEditorStore.getState().themeState);
      }
    } else {
      // No theme config on this profile — snapshot current Zustand state
      // so the debounce doesn't save the previous profile's theme here
      lastSavedThemeRef.current = JSON.stringify(useEditorStore.getState().themeState);
    }
  }, [activeProfile, setThemeState, updateProfileMut]);

  // Debounced theme config save to Convex
  useEffect(() => {
    if (!activeProfile) {
      return;
    }

    const serialized = JSON.stringify(themeState);
    if (serialized === lastSavedThemeRef.current) {
      return;
    }

    if (themeSaveTimerRef.current) {
      clearTimeout(themeSaveTimerRef.current);
    }

    // Capture the profile ID at scheduling time to guard against profile switches
    const targetProfileId = activeProfile._id;

    pendingThemeSaveRef.current = true;
    themeSaveTimerRef.current = setTimeout(() => {
      pendingThemeSaveRef.current = false;
      themeSaveTimerRef.current = undefined;

      // Abort if the active profile has changed since we scheduled
      if (prevProfileIdRef.current !== targetProfileId) {
        return;
      }

      updateProfileMut({
        profileId: targetProfileId,
        updates: { themeConfig: serialized },
      })
        .then(() => {
          // Only update ref if still on the same profile
          if (prevProfileIdRef.current === targetProfileId) {
            lastSavedThemeRef.current = serialized;
          }
        })
        .catch(() => {
          // Reset so next render retries the save
          if (prevProfileIdRef.current === targetProfileId) {
            lastSavedThemeRef.current = "";
          }
        });
    }, THEME_SAVE_DEBOUNCE_MS);

    return () => {
      // Cancel the timer; leave pendingThemeSaveRef.current intact so the
      // profile-switch effect can detect and flush the unsaved edit.
      clearTimeout(themeSaveTimerRef.current);
      themeSaveTimerRef.current = undefined;

      // Best-effort flush on unmount (tab close, sign-out, etc.) so the theme
      // change is not silently lost within the debounce window.
      if (
        prevProfileIdRef.current === targetProfileId &&
        serialized !== lastSavedThemeRef.current
      ) {
        void updateProfileMut({
          profileId: targetProfileId,
          updates: { themeConfig: serialized },
        });
      }
    };
  }, [themeState, activeProfile, updateProfileMut]);

  const [slideDirection, setSlideDirection] = useState(0);
  const chatByProfileRef = useRef<Map<string, string>>(new Map());

  const getLastChatForProfile = useCallback(
    (profileId: Id<"profiles">) => chatByProfileRef.current.get(profileId) ?? null,
    [],
  );

  const setActiveProfile = useCallback(
    (profileId: Id<"profiles">, currentChatId?: string | null) => {
      // Save current chat for current profile before switching
      if (activeProfile && currentChatId) {
        chatByProfileRef.current.set(activeProfile._id, currentChatId);
      } else if (activeProfile && currentChatId === null) {
        chatByProfileRef.current.delete(activeProfile._id);
      }

      const currentIndex = profiles.findIndex((p) => p._id === activeProfile?._id);
      const nextIndex = profiles.findIndex((p) => p._id === profileId);
      setSlideDirection(nextIndex > currentIndex ? 1 : -1);
      void setActive({ profileId });
    },
    [setActive, profiles, activeProfile],
  );

  const contextValue = useMemo(
    () => ({
      profiles,
      activeProfile,
      setActiveProfile,
      isProfilesLoading: isLoading,
      slideDirection,
      getLastChatForProfile,
    }),
    [profiles, activeProfile, setActiveProfile, isLoading, slideDirection, getLastChatForProfile],
  );

  return <ProfileContext.Provider value={contextValue}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return context;
}

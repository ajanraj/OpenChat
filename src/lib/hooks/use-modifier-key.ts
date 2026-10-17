import { useSyncExternalStore } from "react";

const getIsMac = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Mac|iPhone|iPod|iPad/iu.test(navigator.userAgent);
};

const isMac = getIsMac();
const modifierKey = isMac ? "⌘" : "Ctrl";

const unsubscribe = () => {
  // The modifier key never changes, so there is nothing to unsubscribe from
};
const subscribe = () => unsubscribe;

const getSnapshot = (): string => modifierKey;

const getServerSnapshot = (): string => "⌘";

export const useModifierKey = (): string =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

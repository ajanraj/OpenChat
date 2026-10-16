import { useCallback, useSyncExternalStore } from "react";

export const useBreakpoint = (breakpoint: number) => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
      mql.addEventListener("change", onChange);
      return () => {
        mql.removeEventListener("change", onChange);
      };
    },
    [breakpoint]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.innerWidth < breakpoint,
    () => false
  );
};

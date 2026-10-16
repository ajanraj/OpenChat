import { useEffect } from "react";
import type { RefObject } from "react";

// Portal elements whose clicks don't count as outside the edit component
const PORTAL_SELECTOR = [
  // Radix UI dropdown menu elements
  '[data-slot*="dropdown-menu"]',
  // Radix UI popover elements
  '[data-slot*="popover"]',
  // Generic Radix portal container
  "[data-radix-portal]",
  // ARIA menu/dialog/listbox roles
  '[role="menu"]',
  '[role="dialog"]',
  '[role="listbox"]',
  // Radix UI select elements
  "[data-radix-select-viewport]",
  // Tooltip elements (in case tooltips should not close edit)
  '[role="tooltip"]',
].join(", ");

/**
 * Custom click-outside hook for edit components that ignores clicks on portal elements
 * like dropdown menus, popovers, and dialogs
 */
export const useEditClickOutside = <T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void
): void => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const { target } = event;

      // Early return if target is not an Element (could be Text or Document node)
      if (!(target instanceof Element)) {
        return;
      }

      // Don't trigger if clicking inside the ref element
      if (!ref?.current || ref.current.contains(target)) {
        return;
      }

      // Only trigger handler if NOT clicking on dropdown menus, popovers, or other portal elements
      if (target.closest(PORTAL_SELECTOR) === null) {
        handler(event);
      }
    };

    // Add event listeners
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, {
      passive: true,
    });

    // Cleanup
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [ref, handler]);
};

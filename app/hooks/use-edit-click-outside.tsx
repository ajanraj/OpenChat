import { type RefObject, useEffect } from "react";

/**
 * Custom click-outside hook for edit components that ignores clicks on portal elements
 * like dropdown menus, popovers, and dialogs
 */
export function useEditClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void
): void {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;

      // Early return if target is not an Element (could be Text or Document node)
      if (!(target instanceof Element)) {
        return;
      }

      // Don't trigger if clicking inside the ref element
      if (!ref?.current || ref.current.contains(target)) {
        return;
      }

      // Don't trigger if clicking on dropdown menus, popovers, or other portal elements
      const isPortalClick =
        // Radix UI dropdown menu elements
        target.closest('[data-slot*="dropdown-menu"]') ||
        // Radix UI popover elements
        target.closest('[data-slot*="popover"]') ||
        // Generic Radix portal container
        target.closest("[data-radix-portal]") ||
        // ARIA menu/dialog/listbox roles
        target.closest('[role="menu"]') ||
        target.closest('[role="dialog"]') ||
        target.closest('[role="listbox"]') ||
        // Radix UI select elements
        target.closest("[data-radix-select-viewport]") ||
        // Tooltip elements (in case tooltips should not close edit)
        target.closest('[role="tooltip"]');

      // Only trigger handler if NOT clicking on portal elements
      if (!isPortalClick) {
        handler(event);
      }
    };

    // Add event listeners
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    // Cleanup
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [ref, handler]);
}

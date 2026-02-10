/**
 * User Utilities
 * Helper functions for user display names and user-related operations
 */

import type { Doc } from "../../convex/_generated/dataModel";

/**
 * Extracts first name from full name
 */
export function getFirstName(fullName?: string): string | null {
  if (!fullName) {
    return null;
  }
  return fullName.split(" ")[0];
}

/**
 * Gets the display name - prefer preferredName over extracted first name
 */
export function getDisplayName(user: Doc<"users"> | null): string | null {
  if (user?.preferredName) {
    return user.preferredName;
  }
  return getFirstName(user?.name);
}

/**
 * Checks if user is authenticated (not anonymous)
 */
export function isUserAuthenticated(user: Doc<"users"> | null): boolean {
  return Boolean(user) && !user?.isAnonymous;
}

/**
 * Gets user timezone
 */
export function getUserTimezone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const supported =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : null;
  const fallback = supported
    ? supported.includes("Africa/Abidjan")
      ? "Africa/Abidjan"
      : (supported[0] ?? "UTC")
    : "UTC";

  // Some JS runtimes (notably some Node/ICU builds) resolve "UTC" which is not always
  // included in `Intl.supportedValuesOf("timeZone")` even though it is commonly used.
  if (!tz || tz === "UTC") {
    return fallback;
  }

  // If we can validate against the runtime's supported IANA names, fall back to a safe default.
  if (supported && !supported.includes(tz)) {
    return fallback;
  }

  return tz;
}

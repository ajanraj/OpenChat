/**
 * User Utilities
 * Helper functions for user display names and user-related operations
 */

import type { Doc } from "../../convex/_generated/dataModel";

/**
 * Extracts first name from full name
 */
export const getFirstName = (fullName?: string): string | null => {
  if (fullName === undefined || fullName === "") {
    return null;
  }
  return fullName.split(" ")[0];
};

/**
 * Gets the display name - prefer preferredName over extracted first name
 */
export const getDisplayName = (
  user: Pick<Doc<"users">, "preferredName" | "name"> | null
): string | null => {
  if (user?.preferredName !== undefined && user.preferredName !== "") {
    return user.preferredName;
  }
  return getFirstName(user?.name);
};

/**
 * Checks if user is authenticated (not anonymous)
 */
export const isUserAuthenticated = (
  user: Pick<Doc<"users">, "isAnonymous"> | null
): boolean => user !== null && user.isAnonymous !== true;

/** Fallback zone from the runtime's supported list: Africa/Abidjan (UTC+0) if present. */
const getSupportedFallback = (supported: string[]): string =>
  supported.includes("Africa/Abidjan")
    ? "Africa/Abidjan"
    : (supported[0] ?? "UTC");

/**
 * Gets user timezone
 */
export const getUserTimezone = (): string => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : null;
  const fallback = supported ? getSupportedFallback(supported) : "UTC";

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
};

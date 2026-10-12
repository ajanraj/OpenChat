import { ConvexError } from "convex/values";
import { ERROR_CODES, type ErrorCode, getErrorMessage } from "@/lib/error-codes";

const KNOWN_ERROR_CODES = new Set<string>(Object.values(ERROR_CODES));

/**
 * User-facing message for a failed background-agent mutation. Known error codes map to their
 * friendly copy; other ConvexError strings are server-written messages (e.g. "Daily task limit
 * reached (max 5)"). Anything else, such as network or server errors, gets `fallback`.
 */
export function getTaskErrorMessage(error: unknown, fallback: string): string {
	if (!(error instanceof ConvexError) || typeof error.data !== "string") {
		return fallback;
	}
	return KNOWN_ERROR_CODES.has(error.data)
		? getErrorMessage(error.data as ErrorCode)
		: error.data;
}

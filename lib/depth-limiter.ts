/**
 * Limit the depth of nested objects/arrays to prevent exceeding database limits
 * @param obj - The object to limit depth on
 * @param maxDepth - Maximum allowed depth (default: 14, Convex limit is 16)
 * @param currentDepth - Current depth in recursion (internal use)
 * @returns A new object with depth limited
 */
export function limitDepth<T>(obj: T, maxDepth = 14, currentDepth = 0): T {
  // Return primitives as-is
  if (
    obj === null ||
    obj === undefined ||
    typeof obj === "string" ||
    typeof obj === "number" ||
    typeof obj === "boolean" ||
    typeof obj === "bigint" ||
    typeof obj === "symbol"
  ) {
    return obj;
  }

  // Handle functions and other non-serializable types
  if (typeof obj === "function") {
    return "[Function]" as T;
  }

  // If we've reached max depth, truncate
  if (currentDepth >= maxDepth) {
    if (Array.isArray(obj)) {
      return { _truncated: true, _type: "array", _depth: currentDepth } as T;
    }
    return { _truncated: true, _type: "object", _depth: currentDepth } as T;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => limitDepth(item, maxDepth, currentDepth + 1)) as T;
  }

  // Handle dates
  if (obj instanceof Date) {
    return obj;
  }

  // Handle regular objects
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = limitDepth(value, maxDepth, currentDepth + 1);
    }
    return result as T;
  }

  // Fallback for any other type
  return obj;
}

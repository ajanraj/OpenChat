/**
 * What limitDepth returns: primitives and Dates as-is, "[Function]" for functions, and fresh copies
 * of arrays and objects. An object or array nested at maxDepth becomes the record
 * `{ _truncated: true, _type: "array" | "object", _depth }`.
 */
export type DepthLimitedValue =
  | null
  | undefined
  | string
  | number
  | boolean
  | bigint
  | symbol
  | Date
  | DepthLimitedValue[]
  | { [key: string]: DepthLimitedValue };

/**
 * Limit the depth of nested objects/arrays to prevent exceeding database limits
 * @param obj - The object to limit depth on
 * @param maxDepth - Maximum allowed depth (default: 14, Convex limit is 16)
 * @param currentDepth - Current depth in recursion (internal use)
 * @returns A new object with depth limited
 */
export const limitDepth = (
  obj: unknown,
  maxDepth = 14,
  currentDepth = 0
): DepthLimitedValue => {
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
    return "[Function]";
  }

  // If we've reached max depth, truncate
  if (currentDepth >= maxDepth) {
    return {
      _truncated: true,
      _type: Array.isArray(obj) ? "array" : "object",
      _depth: currentDepth,
    };
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    const items: unknown[] = obj;
    return items.map((item) => limitDepth(item, maxDepth, currentDepth + 1));
  }

  // Handle dates
  if (obj instanceof Date) {
    return obj;
  }

  // Handle regular objects
  const result: Record<string, DepthLimitedValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = limitDepth(value, maxDepth, currentDepth + 1);
  }
  return result;
};

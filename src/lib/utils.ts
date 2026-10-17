import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const isDeepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }

  if (typeof a !== "object" || typeof b !== "object") {
    return false;
  }

  const entriesA: [string, unknown][] = Object.entries(a);
  const valuesB = new Map<string, unknown>(Object.entries(b));

  if (entriesA.length !== valuesB.size) {
    return false;
  }

  for (const [key, valueA] of entriesA) {
    if (!valuesB.has(key)) {
      return false;
    }
    if (!isDeepEqual(valueA, valuesB.get(key))) {
      return false;
    }
  }

  return true;
};

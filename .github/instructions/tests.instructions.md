---
applyTo: "**/*.test.{ts,tsx}"
---

# Test Code Review Guidelines

## Framework
- Vitest with `jsdom` environment.
- Import test utilities from `vitest` explicitly (e.g., `import { describe, expect, it, vi } from "vitest"`).
- Test files colocated in `__tests__/` directories.

## Coverage
- Every test file should cover: happy path, edge cases, error cases.
- Bug fixes must include a regression test.
- Mock `console.error`/`console.warn` when testing error paths to keep output clean.

## Practices
- No `any` types in tests — use proper typing.
- Don't test implementation details — test behavior and outputs.
- Clean up mocks/spies with `.mockRestore()`.
- Avoid snapshot tests unless explicitly justified.

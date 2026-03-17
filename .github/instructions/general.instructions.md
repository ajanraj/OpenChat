---
applyTo: "**/*.{ts,tsx}"
---

# General Code Review Guidelines

## TypeScript
- Strict mode. No `any`, `unknown`, `@ts-ignore`, or `as Type` assertions.
- No non-null assertion operator (`!`). Handle nullability explicitly.
- Prefer discriminated unions and exhaustive pattern matching.
- Parse inputs at boundaries into typed structures.

## React
- Functional components only. Hooks at the top level.
- No default exports for components or functions.
- Before suggesting `useEffect`, consider: event handlers, `useMemo`, derived state, or removing the effect entirely.
- Prefer uncontrolled inputs where possible.

## Imports & Dependencies
- Use `~/*` path alias (maps to `src/*`).
- Use `Icon` suffix for Phosphor React icons (e.g., `CaretIcon`).
- Env vars: `import.meta.env.VITE_*` client-side, `process.env.*` server-side.

## Style
- Tailwind CSS v4 utility classes only. No inline styles.
- Follow existing component patterns — check neighboring files before suggesting new abstractions.
- Keep files under ~500 LOC. Split when needed.

## Quality
- No commented-out code. No `console.log` left in production code.
- Avoid over-engineering: no helpers/utilities/abstractions for one-time operations.
- Minimal diffs — don't refactor surrounding code unless directly related to the change.

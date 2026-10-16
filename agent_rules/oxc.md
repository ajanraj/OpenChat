# OXC Lint & Format Rules

## Tooling
- **Linter**: oxlint (type-aware via oxlint-tsgolint), configured in `oxlint.config.ts`
- **Formatter**: oxfmt, configured in `oxfmt.config.ts`
- **Rules**: Ultracite presets `core`, `react`, `tanstack` and `vitest` (see the "Ultracite Code Standards" section of `AGENTS.md`)
- **Type checker**: tsc
- Run `bun run lint` and `bun run format` before committing (`bun run check` / `bun run fix` run both through Ultracite). Never use ESLint or Prettier.

## Project Rules
- `no-unused-vars`: prefix intentionally unused vars and args with `_`.
- `vitest/require-mock-type-parameters`: type every `vi.fn()`, in all files (not just tests).
- `jsx-a11y/no-autofocus`, `react/forward-ref-uses-ref` and `vitest/valid-title` stay on (we enforced them before Ultracite; its presets turn them off).
- Add project-specific rules after the presets in `oxlint.config.ts`, so they win.

## Progressive Migration
Rules that failed on existing code when we adopted Ultracite are turned `off` in `oxlint.config.ts` (top-level `rules`, and the test-file override for `vitest/*`). That list is the migration's to-do list:
1. Remove a few entries, preferring rules that catch bugs (`typescript/no-misused-promises`, `typescript/no-unsafe-*`) over style rules.
2. Run `bun run fix`, then fix what is left by hand.
3. Verify autofixes before committing: some change behavior (for example `vitest/prefer-called-with`, `typescript/no-unnecessary-boolean-literal-compare` on optional fields, `vitest/prefer-expect-type-of`). Run `bun run typecheck` and `bun run test`.

New code must still pass every rule that is on.

## Ignored Paths
Beyond the presets' defaults (build output, generated files, `node_modules`) and `.gitignore`: `src/components`, `agent_rules`, `.github/instructions`; oxfmt also skips `.agents` and `src/styles.css`.

## Note
`src/components/**` is excluded from linting/formatting — be extra careful reviewing component code manually.

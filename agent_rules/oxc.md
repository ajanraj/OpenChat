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
- `unicorn/filename-case`: kebab-case everywhere except `convex/**`, which allows camelCase and snake_case (Convex module paths can't contain hyphens, and renaming a module changes its deployed function paths).
- `typescript/prefer-nullish-coalescing`: `ignoreIfStatements`, because React Compiler rejects `??=` and needs lazy ref init as `if (ref.current === null) ref.current = ...`.
- `no-bitwise`: `convex/lib/auth_helper.ts` allows `^` and `|=` for the constant-time secret compare.
- Every preset rule is on; there are no progressive overrides. Don't add lint-disable comments; fix the code.
- Add project-specific rules after the presets in `oxlint.config.ts`, so they win.

## Autofix Caveats
Some oxlint autofixes change behavior; review them instead of applying blindly: `vitest/prefer-called-with` (drops the real arguments), `vitest/prefer-expect-type-of` (compile-time only; use `toBeTypeOf` for runtime checks), `vitest/prefer-describe-function-title` (Convex functions have an empty runtime name), `typescript/no-unnecessary-boolean-literal-compare` (turns `x === true` on optional flags into `undefined`). Run `bun run typecheck` and `bun run test` after `bun run fix`.

## Ignored Paths
Beyond the presets' defaults (build output, generated files, `node_modules`) and `.gitignore`: `src/components`, `agent_rules`, `.github/instructions`; oxfmt also skips `.agents` and `src/styles.css`.

## Note
`src/components/**` is excluded from linting/formatting — be extra careful reviewing component code manually.

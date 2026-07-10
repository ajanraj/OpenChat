# OXC Lint & Format Rules

## Tooling
- **Linter**: oxlint (type-aware, with `--fix`)
- **Formatter**: oxfmt
- **Type checker**: tsc
- Run `bun run lint` and `bun run format` before committing. Never use ESLint or Prettier.

## Enabled Plugins
`react`, `typescript`, `unicorn`, `import`, `vitest`, `oxc`, `jsx-a11y`

## Key Rules

### TypeScript
- `consistent-type-definitions`: Use `type` not `interface` (error)
- `consistent-type-imports`: Use `import type` for type-only imports (error)
- `no-unnecessary-type-assertion`: Don't assert types that are already narrowed (error)
- `no-inferrable-types`: Don't annotate types the compiler can infer (error)
- `prefer-for-of`: Use `for...of` over indexed `for` loops (warn)

### React
- `exhaustive-deps`: All hook dependencies must be listed (error)
- `rules-of-hooks`: Hooks only at top level of components/hooks (error)
- `jsx-key`: All elements in arrays/iterators need `key` (error)

### Imports
- `no-duplicates`: Merge duplicate import statements (error)
- `first`: Imports must be at the top of the file (error)

### General
- `no-var`: Use `const`/`let`, never `var` (error)
- `prefer-const`: Use `const` when variable is never reassigned (error)
- `no-constant-binary-expression`: No comparisons that always evaluate the same (error)
- `no-unused-vars`: Warn on unused vars/args; prefix with `_` to suppress (warn)

## Ignored Paths
`dev-dist`, `.opencode`, `src/components`, `src/routeTree.gen.ts`, `src/styles.css`, `node_modules`, `dist`, `.vinxi`, `convex/_generated`

## Note
`src/components/**` is excluded from linting/formatting — be extra careful reviewing component code manually.

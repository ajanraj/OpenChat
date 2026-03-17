---
applyTo: "src/routes/**/*.tsx"
---

# Routing Review Guidelines

## TanStack Router (file-based)
- Routes live in `src/routes/` with `__root.tsx` as the shell.
- API routes use `api.*.ts` naming convention.
- Use type-safe route params — don't cast or assert route params.

## Navigation
- Links must use `<Link>` component (not `<a>`) for client-side navigation.
- Support Cmd/Ctrl+click for opening in new tab.
- URL must reflect app state — filters, tabs, pagination should be in the URL.
- Back/Forward must restore scroll position.

## Page Metadata
- Every page route must set `<title>` matching current context.
- No dead ends — always offer a next step or recovery path.

## SSR
- Ensure data loaders don't leak server-only data to the client.
- Handle loading and error states in route components.

---
applyTo: "convex/**/*.ts"
---

# Convex Code Review Guidelines

## Functions
- Public functions (`query`, `mutation`, `action`) are exposed to the Internet — flag if sensitive logic uses public registration instead of `internalQuery`/`internalMutation`/`internalAction`.
- ALL functions MUST have argument validators. Flag missing validators.
- Never accept `userId` as a function argument for auth. Always derive via `ctx.auth.getUserIdentity()`.
- Use `identity.tokenIdentifier` (not `identity.subject`) as the canonical user key.

## Queries
- Never use `.filter()` — use `.withIndex()` with a defined schema index.
- Never use `.collect()` unbounded — prefer `.take(n)` or `.paginate()`.
- Never use `.collect().length` for counting — maintain denormalized counters.
- Queries ending in `.paginate()` return `{ page, isDone, continueCursor }`.

## Mutations
- `ctx.db.patch` for partial updates, `ctx.db.replace` for full replacement.
- For bulk operations exceeding transaction limits, process in batches with `ctx.scheduler.runAfter(0, ...)`.

## Actions
- Actions cannot use `ctx.db`. Flag any `ctx.db` usage in actions.
- `"use node"` only in files that exclusively contain actions. Never in files with queries/mutations.
- `fetch()` works in default runtime — don't add `"use node"` just for fetch.
- Minimize `ctx.runQuery`/`ctx.runMutation` calls from actions — each is a separate transaction.

## Schema
- Schema defined in `convex/schema/` with modular table definitions.
- Index names must include all fields (e.g., `by_field1_and_field2`).
- Don't store unbounded arrays in documents — use separate tables with foreign keys.
- System fields `_id` and `_creationTime` are auto-added.

## File Storage
- Use `ctx.db.system.get` for storage metadata, not deprecated `ctx.storage.getMetadata`.

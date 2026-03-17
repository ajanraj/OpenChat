---
applyTo: "**/*.{ts,tsx}"
---

# Security Review Guidelines

- Never log, expose, or embed secrets, API keys, or tokens in client-side code.
- API keys are encrypted server-side. Flag any plaintext key handling.
- Auth: always derive identity server-side via `ctx.auth.getUserIdentity()`. Never trust client-supplied user IDs.
- Validate and sanitize all external inputs at system boundaries.
- Flag any `dangerouslySetInnerHTML` usage — ensure content is sanitized.
- Environment variables with `VITE_` prefix are exposed to the client. Flag secrets using this prefix.

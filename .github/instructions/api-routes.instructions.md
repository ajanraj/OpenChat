---
applyTo: "src/routes/api.*.ts"
---

# API Route Review Guidelines

These are TanStack Start server functions (Nitro-backed). They handle sensitive operations.

## Security
- Never trust client-supplied user IDs. Derive identity server-side.
- Validate all incoming request bodies and query params at the boundary.
- Never expose secrets, API keys, or internal error details in responses.
- Use `process.env` for secrets — never `import.meta.env` (which leaks to client).

## Error Handling
- Return structured error responses with appropriate HTTP status codes.
- Don't leak stack traces or internal implementation details.
- Log errors server-side for debugging but sanitize client-facing messages.

## Performance
- Mutations should target < 500ms response time.
- Minimize external API calls per request.
- Use streaming for AI responses where applicable.

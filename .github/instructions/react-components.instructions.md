---
applyTo: "src/components/**/*.tsx"
---

# React Component Review Guidelines

## Accessibility
- Full keyboard support per WAI-ARIA APG patterns.
- Visible focus rings via `:focus-visible`.
- Hit targets ≥ 24px (mobile ≥ 44px).
- Icon-only buttons MUST have `aria-label`.
- Prefer native semantics (`button`, `a`, `label`) before ARIA.
- Status cues must not rely on color alone.
- Use `aria-live="polite"` for toasts and inline validation.

## Forms & Inputs
- Loading buttons: show spinner + keep original label.
- Enter submits text inputs. In textarea, Cmd/Ctrl+Enter submits.
- Errors inline next to fields. On submit, focus first error.
- Set `autocomplete` and correct `inputmode`/`type`.
- Warn on unsaved changes before navigation.

## UI Patterns
- Skeletons must mirror final layout to prevent CLS.
- Design empty, sparse, dense, and error states.
- Confirm destructive actions or provide undo.
- Use shadcn/ui components from `@/components/ui/*`. Don't modify library code directly.
- Virtualize large lists (use `virtua`).

## Animation
- Honor `prefers-reduced-motion`.
- Animate only `transform` and `opacity` (compositor-friendly).
- Animations must be interruptible.
- Use Framer Motion for complex animations.

## Performance
- Minimize re-renders. Use React DevTools/React Scan to verify.
- Lazy-load below-the-fold images. Preload above-the-fold.
- Explicit image dimensions to prevent CLS.

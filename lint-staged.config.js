export default {
  "*.{ts,tsx}": [
    "oxlint --type-aware --fix --no-error-on-unmatched-pattern",
    // Same checks as CI: the app with bun check, Convex functions with their own tsconfig
    () => "bun run typecheck",
  ],
  "*.{js,jsx}": ["oxlint --fix --no-error-on-unmatched-pattern"],
};

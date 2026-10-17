export default {
  "*.{ts,tsx}": [
    "oxlint --type-aware --fix --no-error-on-unmatched-pattern",
    () => "bun check",
  ],
  "*.{js,jsx}": ["oxlint --fix --no-error-on-unmatched-pattern"],
};

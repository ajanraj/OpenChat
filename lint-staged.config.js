export default {
  "*.{ts,tsx}": ["oxlint --type-aware --fix --no-error-on-unmatched-pattern", () => "tsc -p ."],
  "*.{js,jsx}": ["oxlint --fix --no-error-on-unmatched-pattern"],
};

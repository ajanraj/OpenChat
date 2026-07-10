export default {
  "*.{ts,tsx}": ["oxlint --type-aware --fix", () => "tsc -p ."],
  "*.{js,jsx}": ["oxlint --fix"],
};

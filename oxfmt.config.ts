import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "**/.agents/**",
    "**/.github/instructions/**",
    "**/agent_rules/**",
    "**/src/components/**",
    "**/src/styles.css",
  ],
  // Sort Tailwind classes against our custom theme. This replaces the preset's
  // value, so its functions list is repeated here.
  sortTailwindcss: {
    functions: ["clsx", "cva", "tw", "twMerge", "cn", "twJoin", "tv"],
    stylesheet: "./src/styles.css",
  },
});

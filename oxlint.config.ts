import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  env: core.env,
  extends: [core, react, tanstack, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/.github/instructions/**",
    "**/agent_rules/**",
    // shadcn/ui and app components are not linted yet; review them manually.
    "**/src/components/**",
  ],
  options: { typeAware: true },
  settings: {
    react: { version: "19" },
  },
  rules: {
    // Project convention: a leading underscore marks an intentionally unused binding.
    "no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    // React Compiler rejects `??=` (react/todo) and requires lazy ref init as
    // `if (ref.current === null) ref.current = ...`, so that if-form must stay allowed.
    "typescript/prefer-nullish-coalescing": [
      "error",
      { ignoreIfStatements: true },
    ],
    // Correctness rules we enforced before Ultracite that its presets turn off.
    "jsx-a11y/no-autofocus": "error",
    "react/forward-ref-uses-ref": "error",
  },
  overrides: [
    {
      // Convex module paths can't contain hyphens, and renaming a module
      // changes the paths of its deployed and scheduled functions.
      files: ["convex/**"],
      rules: {
        "unicorn/filename-case": [
          "error",
          { cases: { camelCase: true, snakeCase: true } },
        ],
      },
    },
    {
      // constantTimeEqual compares the server secret with XOR, the standard
      // constant-time idiom; Convex queries and mutations have no sync built-in.
      files: ["convex/lib/auth_helper.ts"],
      rules: {
        "no-bitwise": ["error", { allow: ["^", "|="] }],
      },
    },
    {
      // Project rule: type every mock, including in shared helpers such as
      // src/test/setup.ts that the vitest preset's test-file globs skip.
      files: ["**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}"],
      plugins: ["vitest"],
      rules: {
        "vitest/require-mock-type-parameters": "error",
      },
    },
    {
      // The vitest preset enables its plugin and rules only for test files.
      // Without `plugins`, Oxlint ignores vitest/* entries here.
      files: [
        "**/*.{test,spec,test-d,spec-d}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
        "**/__tests__/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}",
      ],
      plugins: ["vitest"],
      rules: {
        // Enforced before Ultracite; allowArguments keeps describe(fn) titles valid.
        "vitest/valid-title": ["error", { allowArguments: true }],
      },
    },
  ],
});

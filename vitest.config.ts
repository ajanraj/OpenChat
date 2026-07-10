import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "convex/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".output", "convex/_generated"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules",
        "dist",
        ".output",
        "convex/_generated",
        "**/*.d.ts",
        "**/*.config.*",
      ],
    },
    setupFiles: ["./src/test/setup.ts"],
  },
});

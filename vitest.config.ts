import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.{js,ts,tsx}", "**/*.test.{js,ts,tsx}"],
    exclude: ["node_modules", "dist", ".next"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

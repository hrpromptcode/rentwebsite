import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps jsx: "preserve" for Next; component tests (test/verify-fixes.test.ts) need the JSX compiled
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});

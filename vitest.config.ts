import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["packages/**/test/**/*.spec.ts", "apps/**/test/**/*.spec.ts"],
    testTimeout: 15_000,
  },
});

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      APP_MODE: "demo",
      APP_URL: "http://localhost:3000",
      DATABASE_PATH: ":memory:",
      X_CLIENT_ID: "test-x-client",
      X_CLIENT_SECRET: "test-x-secret",
    },
    pool: "forks",
  },
});

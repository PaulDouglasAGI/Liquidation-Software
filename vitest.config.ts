import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // The app-level guard against importing server modules client-side is
      // irrelevant under vitest's node environment.
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
});

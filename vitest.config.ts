import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // *.live.test.ts talks to a real database and is run on demand by
    // `npm run check:data`, which points vitest at its own config. Keeping it
    // out of the default suite means `npm test` stays offline.
    exclude: ["**/node_modules/**", "tests/**/*.live.test.ts"],
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

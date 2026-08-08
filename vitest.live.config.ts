import { defineConfig } from "vitest/config";
import path from "path";

// Config for `npm run check:data` only: the live-data checks, which the
// default suite deliberately excludes so `npm test` needs no database.
export default defineConfig({
  test: {
    include: ["tests/**/*.live.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
});

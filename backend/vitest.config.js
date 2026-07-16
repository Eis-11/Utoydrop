import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const directory = path.dirname(fileURLToPath(import.meta.url));

const migrations = await readD1Migrations(path.join(directory, "migrations"));

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: {
      configPath: path.join(directory, "../wrangler.jsonc"),
      environment: "preview",
    },
    miniflare: {
      bindings: {
        ADMIN_PASSWORD: "test-password",
        ADMIN_SESSION_TTL_MINUTES: "5",
        ALLOWED_ORIGINS: "https://example.com",
        TEST_MIGRATIONS: migrations,
      },
    },
  })],
  test: {
    setupFiles: [path.join(directory, "tests/setup.js")],
  },
});

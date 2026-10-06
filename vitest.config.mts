import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside a React Server environment; tests run in plain Node.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Neon Auth imports `next/headers` without an extension, which Node's strict ESM
    // resolver rejects; letting Vite process the package resolves it like Next.js does.
    server: { deps: { inline: ["@neondatabase/auth"] } },
  },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Config do Vitest. Alias `@/` → src/ igual ao tsconfig (paths), sem depender
 * de plugin extra. Ambiente node (código de servidor puro, sem DOM).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

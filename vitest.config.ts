import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    include: ["testes/**/*.teste.ts"],
    environment: "node",
    reporters: "verbose",
  },
});

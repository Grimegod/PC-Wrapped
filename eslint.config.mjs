import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "release/**", "preview/**", "node_modules/**", "audit/**", "scripts/**", "*.cjs", "*.mjs"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // node:test returns a promise from every test(); awaiting it is not the convention.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" }
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.renderer.json", "./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // A floating promise in the main process is a silently dropped IPC reply.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: ["error", "always"],
      "prefer-const": "error"
    }
  }
);

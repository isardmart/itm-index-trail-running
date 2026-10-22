import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "test/reference"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.mjs", "examples/**/*.js"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  },
);

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "test/reference", "test/golden.test.ts"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-invalid-void-type": ["error", { allowAsThisParameter: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // Vitest's asymmetric matchers (`expect.stringContaining`…) are typed `any`.
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-unsafe-assignment": "off" },
  },
  {
    files: ["**/*.mjs", "examples/**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  },
);

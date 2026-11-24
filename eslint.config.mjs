import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Every data-layer call is async now; an un-awaited one is a lost write or an unchecked error.
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: { "@typescript-eslint/no-floating-promises": "error" },
  },
  globalIgnores([
    ".next/**",
    // The Playwright suite's build directory (NEXT_DIST_DIR in playwright.config.ts).
    ".next-test/**",
    // Any other NEXT_DIST_DIR (e.g. .next-parity, .next-review).
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;

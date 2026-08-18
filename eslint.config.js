import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/generated/**",
      "**/.turbo/**",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Nest relies on empty constructors for DI and decorated, unused
      // parameters (e.g. guards); the recommended TS rules are too strict here.
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["packages/shared/**/*.ts"],
    rules: {
      // packages/shared must stay runtime-agnostic (CLAUDE.md §7): no
      // @nestjs/*, no react, no anything else that isn't either zod or a
      // relative import within the package. Deny-all-except-allowlist, not a
      // denylist of specific bad packages, so a new non-agnostic dependency
      // is caught automatically instead of needing its own entry.
      //
      // Uses `regex`, not `group` (gitignore-style patterns matched via the
      // `ignore` package) — gitignore semantics can't reliably re-include a
      // relative path once a broad `*` pattern excludes it, so a
      // group: ["*", "!./*", ...] negation silently fails to allow relative
      // imports (verified: `!./*` never un-ignores `./foo` here).
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.{1,2}\\/)(?!zod(?:\\/.*)?$).+$",
              message:
                "packages/shared must stay runtime-agnostic — only zod and relative imports within the package are allowed (see CLAUDE.md §7).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  eslintConfigPrettier,
);

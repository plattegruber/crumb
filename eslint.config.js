import js from "@eslint/js";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // ---------------------------------------------------------------------------
  // Global ignores
  // ---------------------------------------------------------------------------
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.svelte-kit/**",
      "**/coverage/**",
      "**/.wrangler/**",
      "**/.astro/**",
      "**/migrations/**/*.sql",
      ".claude/**",
    ],
  },

  // ---------------------------------------------------------------------------
  // 1. Base JS recommended rules
  // ---------------------------------------------------------------------------
  js.configs.recommended,

  // ---------------------------------------------------------------------------
  // 2. TypeScript strict rules for all .ts files
  // ---------------------------------------------------------------------------
  ...tseslint.configs.strict,

  // ---------------------------------------------------------------------------
  // TypeScript-specific rule overrides (all .ts files)
  // ---------------------------------------------------------------------------
  {
    files: ["**/*.ts"],
    rules: {
      // CLAUDE.md: "No any"
      "@typescript-eslint/no-explicit-any": "error",

      // CLAUDE.md: "No non-null assertion"
      "@typescript-eslint/no-non-null-assertion": "error",

      // Unused vars: error with underscore exception
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Prefer import type
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],

      // No console.log/debug (console.error and console.warn allowed for error reporting)
      "no-console": ["warn", { allow: ["error", "warn"] }],

      // Strict equality
      eqeqeq: ["error", "always"],

      // Prefer const
      "prefer-const": "error",

      // No var
      "no-var": "error",

      // No throw literal (non-type-checked variant)
      "no-throw-literal": "error",
    },
  },

  // ---------------------------------------------------------------------------
  // Allow console in logger.ts
  // ---------------------------------------------------------------------------
  {
    files: ["**/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // ---------------------------------------------------------------------------
  // 3. Svelte rules for .svelte files (with TypeScript parser)
  // ---------------------------------------------------------------------------
  ...svelte.configs["flat/recommended"],

  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      // CLAUDE.md rules for Svelte files
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": ["warn", { allow: ["error", "warn"] }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
      // Disabled: app uses simple string literal paths without a base path,
      // so resolve() wrapping is unnecessary and would require refactoring
      // every navigation link across the entire frontend.
      "svelte/no-navigation-without-resolve": "off",
    },
  },

  // ---------------------------------------------------------------------------
  // 4. Prettier compat (disable conflicting formatting rules)
  // ---------------------------------------------------------------------------
  prettier,
  ...svelte.configs["flat/prettier"],

  // ---------------------------------------------------------------------------
  // 5. Test file overrides — slightly more relaxed
  // ---------------------------------------------------------------------------
  {
    files: ["**/test/**/*.ts", "**/*.test.ts"],
    rules: {
      // Allow console in tests
      "no-console": "off",
      // Allow type assertions (as casts) in test fixtures
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      // Allow non-null assertions in tests for array/object access in assertions
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // ---------------------------------------------------------------------------
  // Worker globals for Cloudflare files
  // ---------------------------------------------------------------------------
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.worker,
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Browser globals for kit-plugin (DOM library)
  // ---------------------------------------------------------------------------
  {
    files: ["apps/kit-plugin/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Browser globals for web frontend
  // ---------------------------------------------------------------------------
  {
    files: ["apps/web/**/*.ts", "apps/web/**/*.svelte"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Node globals for config files
  // ---------------------------------------------------------------------------
  {
    files: ["*.config.js", "*.config.ts", "**/vite.config.ts", "**/vitest.config.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);

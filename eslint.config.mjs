import js from "@eslint/js";
import eslintPluginPrettierRecommended  from 'eslint-plugin-prettier/recommended';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  eslintPluginUnicorn.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: {
      js,
      unicorn: eslintPluginUnicorn,
    },
    extends: [
      "js/recommended",
      "unicorn/recommended",
    ],
    languageOptions: {
      globals: globals.browser,
      globals: globals.builtin,
    },
    rules: {
      'prettier/prettier': [
        'warn',
        {
          trailingComma: 'es5',
          tabWidth: 4,
          useTabs: false,
          semi: true,
          singleQuote: true,
          bracketSpacing: true,
          endOfLine: 'auto',
          printWidth: 120,
        },
      ],
      'no-undef': 'off',
      'no-var': 'error',
      'capitalized-comments': 'off',
      'no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          vars: 'all',
          varsIgnorePattern: '^_',
        },
      ],
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/consistent-existence-index-check': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/no-anonymous-default-export': 'off',
      'unicorn/prefer-node-protocol': 'off',
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs"
    },
  },
  eslintPluginPrettierRecommended,
]);

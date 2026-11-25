// @ts-check
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const playwright = require('eslint-plugin-playwright');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'application-under-test/**',
      'reports/**',
      'allure-results/**',
      'allure-report/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // Expectations are frequently delegated to reusable assertion helpers.
      'playwright/expect-expect': [
        'error',
        { assertFunctionPatterns: ['^expect', '^assert', '^verify'] },
      ],
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-skipped-test': ['error', { allowConditional: true }],
      'playwright/no-wait-for-timeout': 'error',
      // Tags come from the typed `Tag` constant (src/constants), which the rule cannot evaluate statically.
      'playwright/valid-test-tags': 'off',
    },
  },
  {
    files: ['scripts/**/*.ts', 'postman/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // k6 scripts run in the k6 (goja) runtime, not Node.js.
    files: ['performance/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly', console: 'readonly' },
    },
  },
  {
    // Playwright fixtures must destructure their dependencies, even when empty (`{}`).
    files: ['src/fixtures/**/*.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },
  prettier,
);

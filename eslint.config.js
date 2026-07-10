import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    // Вкладені git worktree — окремі checkout-и зі своїм gate. Сканувати їх із батьківського
    // дерева означає lint-ити той самий репозиторій удруге й змішувати результати двох гілок.
    ignores: ['node_modules/**', 'data/**', 'playwright-report/**', 'test-results/**', '.worktrees/**'],
  },
  js.configs.recommended,
  {
    // .mjs — скрипти-ворота в scripts/. Без цього рядка eslint не дав би їм node-глобалів.
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Express-мідлварі помилок потрібні чотири параметри, навіть невживані.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Frontend крутиться в браузері, не в Node.
    files: ['src/public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
];

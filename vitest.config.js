import { defineConfig } from 'vitest/config';

// Два проєкти = два рівні, які можна ганяти окремо (`vitest run --project unit`).
// Жоден include не покриває tests/e2e/** — там живе Playwright, і Vitest туди не лізе.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.js'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.js'],
          environment: 'node',
        },
      },
    ],
  },
});

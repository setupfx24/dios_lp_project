// Next.js client/server config — allows default exports for pages/layouts, browser globals.
import base from './index.js';
import globals from 'globals';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Next.js pages, layouts, route handlers require default exports.
      'import/no-default-export': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['apps/api/**', 'apps/workers/**'],
              message: 'Frontend must not import backend internals. Use @lp/sdk.',
            },
          ],
        },
      ],
    },
  },
];

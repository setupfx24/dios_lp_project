// Node service config (NestJS, workers, scripts).
import base from './index.js';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      'no-process-exit': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['apps/web/**', 'apps/admin/**'],
              message: 'Backend code must not import from frontend apps. Share via packages/*.',
            },
          ],
        },
      ],
    },
  },
];

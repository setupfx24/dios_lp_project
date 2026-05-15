import config from '@lp/eslint-config/nextjs';

export default [
  {
    ignores: ['.next/**', 'next-env.d.ts', 'node_modules/**'],
  },
  ...config,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];

import config from '@lp/eslint-config/nextjs';

export default [
  {
    ignores: ['.next/**', 'next-env.d.ts', 'node_modules/**', 'public/**'],
  },
  ...config,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Next layouts/pages export default React components.
      'react/react-in-jsx-scope': 'off',
    },
  },
];

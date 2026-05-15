import config from '@lp/eslint-config/node';

export default [
  ...config,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // NestJS DI relies on constructor parameter properties; relax this one rule.
      '@typescript-eslint/parameter-properties': 'off',
    },
  },
];

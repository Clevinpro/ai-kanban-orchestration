const nx = require('@nx/eslint-plugin');
const tseslint = require('typescript-eslint');

module.exports = [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/javascript'],
  ...nx.configs['flat/typescript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/coverage', '**/.nx'],
  },
  {
    files: ['apps/**/*.{ts,tsx,js,jsx,mts,cts,cjs,mjs}', 'libs/**/*.{ts,tsx,js,jsx,mts,cts,cjs,mjs}'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [{ sourceTag: '*', onlyDependOnLibsWithTags: ['*'] }],
        },
      ],
      'no-console': 'error',
      'prefer-const': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['apps/**/src/**/*.ts', 'libs/**/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['libs/**/package.json'],
    rules: {
      '@nx/dependency-checks': 'off',
    },
  },
];

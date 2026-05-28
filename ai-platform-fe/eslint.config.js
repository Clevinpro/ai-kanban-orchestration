const eslint = require('@eslint/js');
const eslintConfigPrettier = require('eslint-config-prettier');
const reactHooks = require('eslint-plugin-react-hooks');
const tseslint = require('typescript-eslint');

const roots = ['ai-platform', 'ai-platform-fe'];

const tsFiles = roots.flatMap((root) => [
  `${root}/**/*.{ts,mts,cts}`,
  `${root}/**/*.tsx`,
]);

const jsFiles = roots.flatMap((root) => [
  `${root}/**/*.{js,mjs,cjs}`,
  `${root}/**/*.jsx`,
]);

const allCodeFiles = [...tsFiles, ...jsFiles];

const reactFiles = roots.flatMap((root) => [`${root}/**/*.{jsx,tsx}`]);

module.exports = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/out-tsc/**',
      '**/.nx/**',
      '**/vite.config.*.timestamp-*',
    ],
  },
  {
    files: allCodeFiles,
    ...eslint.configs.recommended,
  },
  ...tseslint.configs.strict.map((block) => ({
    ...block,
    files: tsFiles,
  })),
  {
    files: tsFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
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
    files: jsFiles,
    rules: {
      'no-console': 'error',
      'prefer-const': 'error',
      'no-unused-vars': [
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
    files: reactFiles,
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  eslintConfigPrettier,
);

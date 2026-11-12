/**
 * @file Type-aware lint configuration.
 * @description Applies strict TypeScript rules while treating build scripts as plain JavaScript.
 * @exports Repository-wide ESLint flat configuration.
 */
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'artifacts/**',
      'coverage/**',
      'dist/**',
      '**/node_modules/**',
      '.runtime/**',
      'release/**',
      'native-installer/source/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false } },
      ],
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'require',
          'module',
          'process',
          'console',
          'Buffer',
          'setTimeout',
          'clearTimeout',
          'setImmediate',
          'URL',
          'TextDecoder',
          'Response',
          'Request',
          'structuredClone',
          '__dirname',
        ].map((name) => [name, 'readonly']),
      ),
    },
  },
  {
    files: ['desktop/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
);
